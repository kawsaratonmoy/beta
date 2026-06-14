import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc, orderBy, query, where, runTransaction } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { firebaseConfig, BKASH_NUMBER, COD_NUMBER, DELIVERY_FEE } from './config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Status arrays
const statusColors = {
  Pending: '#eab308',
  Processing: '#3b82f6',
  Dispatched: '#eab308',
  Delivered: '#22c55e',
  Cancelled: '#ef4444'
};

// ====== CART SYSTEM ======
function getCart() {
  const cart = localStorage.getItem('cart');
  return cart ? JSON.parse(cart) : [];
}

function saveCart(cart) {
  localStorage.setItem('cart', JSON.stringify(cart));
  updateCartUI();
}

// Attach cart to window to allow inline HTML onclick calls
window.addToCart = function(productId, qty = 1) {
  const product = productsMap.get(productId);
  if (!product || product.availability === 'Upcoming') return;

  const isOOS = Number(product.stock) <= 0 && product.availability !== 'Pre Order';
  if (isOOS) {
    alert('This product is out of stock!');
    return;
  }

  let cart = getCart();
  const existing = cart.find(item => item.id === productId);

  const finalPrice = Number(product.discount) > 0 
    ? (Number(product.price) - Number(product.discount)) 
    : Number(product.price);

  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      id: productId,
      name: product.name,
      color: product.color || '',
      price: finalPrice,
      image: product.images?.[0] || 'logo.png',
      qty: qty
    });
  }
  saveCart(cart);
}

function removeFromCart(productId) {
  let cart = getCart();
  cart = cart.filter(item => item.id !== productId);
  saveCart(cart);
}

function updateCartQuantity(productId, newQty) {
  if (newQty < 1) {
    removeFromCart(productId);
    return;
  }
  let cart = getCart();
  const item = cart.find(i => i.id === productId);
  if (item) item.qty = newQty;
  saveCart(cart);
}

function updateCartUI() {
  const cart = getCart();
  const countEl = document.getElementById('cart-count');
  if (countEl) countEl.textContent = cart.reduce((sum, i) => sum + i.qty, 0);

  const itemsContainer = document.getElementById('cart-items');
  const totalEl = document.getElementById('cart-total');
  const emptyMsg = document.getElementById('cart-empty');
  
  if (!itemsContainer) return;

  if (cart.length === 0) {
    itemsContainer.innerHTML = '';
    if (totalEl) totalEl.innerHTML = '<strong>Total: ৳0</strong>';
    if (emptyMsg) emptyMsg.classList.remove('hidden');
    return;
  }

  if (emptyMsg) emptyMsg.classList.add('hidden');
  itemsContainer.innerHTML = '';
  let total = 0;

  cart.forEach(item => {
    const itemTotal = item.price * item.qty;
    total += itemTotal;

    const div = document.createElement('div');
    div.className = 'flex items-center gap-4 bg-surface-container-low p-3 rounded-xl border border-white/5';
    div.innerHTML = `
      <img src="${item.image}" alt="${item.name}" class="w-16 h-16 object-cover rounded-lg bg-surface-container-lowest" onerror="this.src='logo.png'">
      <div class="flex-1 min-w-0">
        <h4 class="text-sm font-bold text-on-surface truncate">${item.name}</h4>
        <div class="text-xs text-slate-400">Color: ${item.color || '-'}</div>
        <div class="text-xs font-mono text-primary font-bold mt-1">৳${item.price} × ${item.qty} = ৳${itemTotal}</div>
        <div class="flex items-center gap-3 mt-2">
          <div class="flex items-center bg-surface-container rounded-lg border border-white/5">
            <button class="qty-minus px-2 py-1 hover:text-white text-slate-400 transition-colors">-</button>
            <span class="qty-display text-xs font-bold w-4 text-center">${item.qty}</span>
            <button class="qty-plus px-2 py-1 hover:text-white text-slate-400 transition-colors">+</button>
          </div>
          <button class="remove-btn text-xs text-red-400 hover:text-red-300 transition-colors underline">Remove</button>
        </div>
      </div>
    `;

    div.querySelector('.qty-minus').addEventListener('click', () => {
      updateCartQuantity(item.id, item.qty - 1);
      div.querySelector('.qty-display').textContent = Math.max(1, item.qty - 1);
    });
    div.querySelector('.qty-plus').addEventListener('click', () => {
      updateCartQuantity(item.id, item.qty + 1);
      div.querySelector('.qty-display').textContent = item.qty + 1;
    });
    div.querySelector('.remove-btn').addEventListener('click', () => {
      removeFromCart(item.id);
    });

    itemsContainer.appendChild(div);
  });

  if (totalEl) totalEl.innerHTML = `<strong>Total: ৳${total}</strong>`;
}

// Global Maps
const productsMap = new Map();

// ====== UTIL ======
async function loadProducts() {
  try {
    const snapshot = await getDocs(collection(db, 'products'));
    const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    productsMap.clear();
    products.forEach(p => productsMap.set(p.id, p));
    return products;
  } catch (err) {
    console.error('Error loading products:', err);
    return [];
  }
}

function shuffle(array) {
  return array.slice().sort(() => Math.random() - 0.5);
}

// ====== TAILWIND PRODUCT CARD GENERATOR ======
function createProductCard(p, products) {
  const isUpcoming = p.availability === 'Upcoming';
  const isOOS = !isUpcoming && Number(p.stock) <= 0 && p.availability !== 'Pre Order';
  const isPreOrder = p.availability === 'Pre Order';
  const hasDiscount = Number(p.discount) > 0;
  const price = Number(p.price) || 0;
  const finalPrice = hasDiscount ? (price - Number(p.discount)) : price;
  const images = p.images || [];

  const isInStock = Number(p.stock) > 0 && p.availability === 'Ready';

  const sameName = products.filter(other => other.name.toLowerCase() === p.name.toLowerCase());
  let slug = p.name.toLowerCase().replace(/\s+/g, '-');
  if (sameName.length > 1 && p.color) {
    slug += '-' + p.color.toLowerCase().replace(/\s+/g, '-');
  }

  const card = document.createElement('div');
  card.className = "group relative bg-surface-container-low rounded-xl overflow-hidden transition-all duration-500 hover:translate-y-[-8px] border border-white/5 hover:border-primary/30 flex flex-col";
  
  let badgeHTML = '';
  if (p.hotDeal) badgeHTML += `<span class="bg-primary text-on-primary-fixed text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-xl mr-1 mb-1 inline-block">Hot Deal</span>`;
  if (isPreOrder) badgeHTML += `<span class="bg-purple-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-xl mr-1 mb-1 inline-block">Pre Order</span>`;
  if (isOOS) badgeHTML += `<span class="bg-red-900/80 text-red-200 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-xl mr-1 mb-1 inline-block">Out of Stock</span>`;
  if (isUpcoming) badgeHTML += `<span class="bg-slate-700 text-slate-200 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-xl mr-1 mb-1 inline-block">Upcoming</span>`;

  card.innerHTML = `
    <div class="aspect-[4/5] bg-surface-container-lowest relative overflow-hidden cursor-pointer flex-shrink-0" onclick="window.location.href='product.html?slug=${slug}'">
      <img class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700 scale-105 group-hover:scale-100" src="${images[0] || 'logo.png'}" alt="${p.name}">
      <div class="absolute top-4 left-4 right-4 flex flex-wrap z-10">
        ${badgeHTML}
      </div>
      ${!isOOS && !isUpcoming ? `
      <button class="absolute bottom-4 right-4 w-12 h-12 bg-surface-bright/80 backdrop-blur-md rounded-full flex items-center justify-center text-primary opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0 shadow-2xl z-20" data-id="${p.id}" onclick="event.stopPropagation(); window.addToCart('${p.id}'); alert('Added to cart!');">
        <span class="material-symbols-outlined pointer-events-none">add_shopping_cart</span>
      </button>` : ''}
    </div>
    <div class="p-6 cursor-pointer flex-1 flex flex-col justify-between" onclick="window.location.href='product.html?slug=${slug}'">
      <div>
        <div class="flex justify-between items-start mb-2 gap-2">
          <h3 class="text-xl font-bold tracking-tight line-clamp-1">${p.name}</h3>
          <span class="text-primary font-mono font-bold whitespace-nowrap">${isUpcoming ? 'TBA' : '৳' + finalPrice}</span>
        </div>
        <p class="text-sm text-outline mb-4 line-clamp-2">${p.description || 'Premium component.'}</p>
      </div>
      <div class="flex gap-2 mt-auto">
        ${p.color ? `<span class="bg-surface-container-highest text-[10px] text-on-surface-variant font-bold px-3 py-1 rounded-full truncate max-w-[50%]">${p.color}</span>` : ''}
        ${p.category ? `<span class="bg-surface-container-highest text-[10px] text-on-surface-variant font-bold px-3 py-1 rounded-full truncate max-w-[50%]">${p.category}</span>` : ''}
      </div>
    </div>
  `;
  return card;
}

// ====== PAGE ROUTERS ======

// 1. HOME PAGE LOGIC
async function initHomePage() {
  const productsContainer = document.getElementById('interest-products');
  const categoriesContainer = document.getElementById('categories');
  const products = await loadProducts();
  
  if (products.length === 0) return;

  // Random Hero Generator
  const heroSection = document.getElementById('hero-section');
  if (heroSection) {
      const randomProduct = products[Math.floor(Math.random() * products.length)];
      const titleParts = randomProduct.name.split(' ');
      const p1 = titleParts.slice(0, 2).join(' ');
      const p2 = titleParts.slice(2).join(' ') || 'EDITION';

      document.getElementById('hero-tag').textContent = `Featured ${randomProduct.category || 'Gear'}`;
      document.getElementById('hero-title').innerHTML = `${p1} <br/><span class="text-transparent bg-clip-text bg-gradient-to-br from-primary to-primary-container">${p2}</span>`;
      document.getElementById('hero-desc').textContent = randomProduct.description || "Experience premium mechanical artistry. Built for durability, aesthetic precision, and the ultimately satisfying tactile soundscape.";
      if(randomProduct.images && randomProduct.images[0]) document.getElementById('hero-img').src = randomProduct.images[0];
      
      const sameName = products.filter(other => other.name.toLowerCase() === randomProduct.name.toLowerCase());
      let slug = randomProduct.name.toLowerCase().replace(/\s+/g, '-');
      if (sameName.length > 1 && randomProduct.color) slug += '-' + randomProduct.color.toLowerCase().replace(/\s+/g, '-');
      
      document.getElementById('hero-link').href = `product.html?slug=${slug}`;
      heroSection.classList.remove('opacity-0');
  }

  // Interest Products Grid
  if (productsContainer) {
    productsContainer.innerHTML = '';
    shuffle(products).slice(0, 8).forEach(p => {
      productsContainer.appendChild(createProductCard(p, products));
    });
  }

  // Dynamic Categories Array
  if (categoriesContainer) {
    const uniqueCats = [...new Set(products.map(p => p.category).filter(Boolean))];
    categoriesContainer.innerHTML = '';
    uniqueCats.forEach(cat => {
      const catCard = document.createElement('div');
      catCard.className = "bg-surface-container rounded-2xl p-8 flex flex-col justify-between group overflow-hidden relative min-h-[200px] border border-white/5 cursor-pointer hover:border-primary/30 transition-all";
      catCard.onclick = () => { window.location.href = `products.html?category=${encodeURIComponent(cat)}`; };
      catCard.innerHTML = `
          <div class="z-10">
              <h3 class="headline-font text-xl font-bold capitalize text-on-surface group-hover:text-primary transition-colors">${cat}</h3>
              <p class="text-xs text-on-surface-variant mt-1">Explore Collection →</p>
          </div>
          <span class="material-symbols-outlined absolute bottom-4 right-4 text-6xl text-white/5 group-hover:text-primary/10 group-hover:scale-110 transition-all duration-300">layers</span>
      `;
      categoriesContainer.appendChild(catCard);
    });
  }
}

// 2. PRODUCTS PAGE LOGIC
async function initProductsPage() {
  const container = document.getElementById('products-grid');
  if (!container) return;

  const products = await loadProducts();
  container.innerHTML = '';
  
  if(products.length === 0) {
    container.innerHTML = '<p class="text-slate-400 col-span-3 text-center py-12">No products available.</p>';
    return;
  }

  products.forEach(p => {
    container.appendChild(createProductCard(p, products));
  });

  // Note: Add logic here later if you want to hook up the HTML Sidebar Filters
}

// 3. PRODUCT DETAILS PAGE LOGIC
async function initProductPage() {
  const params = new URLSearchParams(window.location.search);
  const urlSlug = params.get('slug');
  if (!urlSlug) return;

  const products = await loadProducts();
  let product = null;

  for (const p of products) {
    const sameName = products.filter(other => other.name.toLowerCase() === p.name.toLowerCase());
    let slug = p.name.toLowerCase().replace(/\s+/g, '-');
    if (sameName.length > 1 && p.color) {
      slug += '-' + p.color.toLowerCase().replace(/\s+/g, '-');
    }
    if (slug === urlSlug) {
      product = p;
      break;
    }
  }

  if (!product) {
    alert('Product not found');
    return;
  }

  // Populate Details
  document.title = product.metaTitle || product.name;
  
  const images = product.images || [];
  const mainImg = document.getElementById('main-image');
  if (mainImg) {
    mainImg.src = images[0] || 'logo.png';
    mainImg.onclick = () => {
      document.getElementById('viewer-img').src = mainImg.src;
      document.getElementById('image-viewer').classList.remove('hidden');
    };
  }

  const thumbGallery = document.getElementById('thumbnail-gallery');
  if (thumbGallery) {
    thumbGallery.innerHTML = '';
    images.slice(0, 4).forEach(src => {
      const wrapper = document.createElement('div');
      wrapper.className = "aspect-square bg-surface-container-high rounded-lg overflow-hidden border border-outline-variant/20 cursor-pointer";
      wrapper.innerHTML = `<img src="${src}" class="w-full h-full object-cover grayscale hover:grayscale-0 transition-all">`;
      wrapper.onclick = () => { mainImg.src = src; };
      thumbGallery.appendChild(wrapper);
    });
  }

  if (document.getElementById('product-name')) document.getElementById('product-name').textContent = product.name;
  if (document.getElementById('product-color')) document.getElementById('product-color').textContent = product.color ? `Color: ${product.color}` : '';
  
  const isUpcoming = product.availability === 'Upcoming';
  const hasDiscount = Number(product.discount) > 0;
  const price = Number(product.price) || 0;
  const finalPrice = hasDiscount ? (price - Number(product.discount)) : price;
  
  const priceEl = document.getElementById('product-price');
  if (priceEl) priceEl.innerHTML = isUpcoming ? 'TBA' : `${hasDiscount ? `<s class="text-slate-500 text-xl mr-2">৳${price.toFixed(2)}</s> ` : ''}৳${finalPrice.toFixed(2)}`;

  if (document.getElementById('product-spec')) document.getElementById('product-spec').textContent = product.description || '';
  if (document.getElementById('product-detailed-desc')) document.getElementById('product-detailed-desc').innerHTML = product.detailedDescription || '';

  const orderRow = document.getElementById('order-row');
  if (orderRow) {
    orderRow.innerHTML = '';
    if (isUpcoming) {
      orderRow.innerHTML = `<button class="w-full py-5 bg-surface-variant/40 backdrop-blur-md text-slate-400 font-display font-bold text-lg rounded-xl cursor-not-allowed" disabled>Upcoming - Stay Tuned</button>`;
    } else if (Number(product.stock) <= 0 && product.availability !== 'Pre Order') {
      orderRow.innerHTML = `<button class="w-full py-5 bg-red-900/30 text-red-400 font-display font-bold text-lg rounded-xl border border-red-900/50 cursor-not-allowed" disabled>Out of Stock</button>`;
    } else {
      orderRow.innerHTML = `
        <button id="btn-buy-now" class="w-full py-5 bg-gradient-to-br from-primary to-primary-container text-on-primary-fixed font-display font-bold text-lg rounded-xl flex items-center justify-center gap-3 hover:shadow-[0_0_20px_rgba(236,215,255,0.3)] transition-all active:scale-95 duration-150">
          <span class="material-symbols-outlined">bolt</span> ${product.availability === 'Pre Order' ? 'Pre Order Now' : 'Order Now'}
        </button>
        <button id="btn-add-cart" class="w-full py-5 bg-surface-variant/40 backdrop-blur-md text-primary font-display font-bold text-lg rounded-xl border border-outline-variant/20 hover:bg-surface-variant/60 transition-all active:scale-95 duration-150">
          Add to Cart
        </button>
      `;
      document.getElementById('btn-buy-now').onclick = () => openCheckoutModal(product.id, product.availability === 'Pre Order');
      document.getElementById('btn-add-cart').onclick = () => { window.addToCart(product.id); alert('Added to cart!'); };
    }
  }

  // Other products mapping
  const otherSection = document.getElementById('other-products');
  if (otherSection) {
    otherSection.innerHTML = '';
    const eligible = products.filter(p => p.availability !== 'Upcoming' && p.id !== product.id);
    shuffle(eligible).slice(0, 4).forEach(p => otherSection.appendChild(createProductCard(p, products)));
  }
}

// ====== MODALS & CHECKOUT LOGIC ======
function calculateDeliveryFee(address) {
  const lowerAddr = address.toLowerCase();
  if (lowerAddr.includes("savar")) return 70;
  else if (lowerAddr.includes("dhaka")) return 110;
  return 150;
}

// Single Product Checkout logic
async function openCheckoutModal(productId, isPreOrder = false) {
  const products = await loadProducts();
  const p = products.find(x => x.id === productId);
  if (!p) return;

  const price = p.price === 'TBA' ? 0 : Number(p.price) || 0;
  const discount = Number(p.discount) || 0;
  const unit = price - discount;

  document.getElementById('co-product-id').value = p.id;
  document.getElementById('co-product-name').value = p.name;
  document.getElementById('co-color').value = p.color || '';
  document.getElementById('co-price').value = unit.toFixed(2);
  document.getElementById('co-unit-price-raw').value = unit.toString();
  document.getElementById('co-available-stock').value = String(p.stock);
  
  const deliveryFee = calculateDeliveryFee('');
  document.getElementById('co-delivery').value = `Delivery Charge = ${deliveryFee}`;
  document.getElementById('co-delivery').dataset.fee = deliveryFee;

  document.getElementById('checkout-modal').classList.remove('hidden');
  updateTotalInModal();
}

function updateTotalInModal() {
  const qty = Number(document.getElementById('co-qty').value) || 1;
  const unit = Number(document.getElementById('co-unit-price-raw').value) || 0;
  const delivery = Number(document.getElementById('co-delivery').dataset.fee) || DELIVERY_FEE;
  const total = (qty * unit) + delivery;

  document.getElementById('co-total').value = total.toFixed(2);
  const paymentMethod = document.getElementById('co-payment').value;

  if (paymentMethod === 'Bkash') {
    document.getElementById('co-pay-now').value = total.toFixed(2);
    document.getElementById('co-due-amount').value = '0.00';
  } else if (paymentMethod === 'Cash on Delivery') {
    document.getElementById('co-pay-now').value = delivery.toFixed(2);
    document.getElementById('co-due-amount').value = (qty * unit).toFixed(2);
  }
}

function closeCheckoutModal() {
  const m1 = document.getElementById('checkout-modal');
  const m2 = document.getElementById('cart-checkout-modal');
  if(m1) m1.classList.add('hidden');
  if(m2) m2.classList.add('hidden');
}


// ====== GLOBAL INITIALIZATION ROUTER ======
document.addEventListener('DOMContentLoaded', async () => {
  updateCartUI();

  // Route Identifiers mapped to NEW Tailwind IDs
  const isHome = !!document.getElementById('interest-products');
  const isProducts = !!document.getElementById('products-grid');
  const isProduct = !!document.getElementById('product-section');

  if (isHome) await initHomePage();
  if (isProducts) await initProductsPage();
  if (isProduct) await initProductPage();

  // Side Cart Triggers
  document.getElementById('cart-link')?.addEventListener('click', () => {
    document.getElementById('cart-slider').classList.remove('hidden');
    document.getElementById('cart-slider').classList.remove('translate-x-full');
  });
  document.getElementById('close-cart')?.addEventListener('click', () => {
    document.getElementById('cart-slider').classList.add('translate-x-full');
  });

  // Modal Closers
  document.getElementById('close-modal-btn')?.addEventListener('click', closeCheckoutModal);
  document.getElementById('cart-close-modal-btn')?.addEventListener('click', closeCheckoutModal);
  document.getElementById('close-viewer')?.addEventListener('click', () => {
    document.getElementById('image-viewer').classList.add('hidden');
  });

  // Single Checkout Listeners
  document.getElementById('co-address')?.addEventListener('input', () => {
    const val = document.getElementById('co-address').value;
    document.getElementById('co-delivery').dataset.fee = calculateDeliveryFee(val);
    updateTotalInModal();
  });
  document.getElementById('co-payment')?.addEventListener('change', updateTotalInModal);
  document.getElementById('co-qty')?.addEventListener('input', updateTotalInModal);

  // You can attach your submitCheckoutOrder handlers here similarly.
});
