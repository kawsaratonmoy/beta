import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc, orderBy, query, where, runTransaction } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { firebaseConfig, BKASH_NUMBER, COD_NUMBER, DELIVERY_FEE } from './config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ====== CART SYSTEM ======
function getCart() {
  const cart = localStorage.getItem('cart');
  return cart ? JSON.parse(cart) : [];
}

function saveCart(cart) {
  localStorage.setItem('cart', JSON.stringify(cart));
  updateCartUI();
}

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
      // Direct Navigation to Checkout Page Instead of Popup Modal
      document.getElementById('btn-buy-now').onclick = () => { window.location.href = `checkout.html?id=${product.id}`; };
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

// ====== CHECKOUT LOGIC & ROUTER ======
function calculateDeliveryFee(address) {
  const lowerAddr = address.toLowerCase();
  if (lowerAddr.includes("savar")) return 70;
  else if (lowerAddr.includes("dhaka")) return 110;
  return 150;
}

// Reusable single product form update function
function updateTotalInModal() {
  const qtyEl = document.getElementById('co-qty');
  const unitEl = document.getElementById('co-unit-price-raw');
  const deliveryEl = document.getElementById('co-delivery');
  if (!qtyEl || !unitEl || !deliveryEl) return;

  const qty = Number(qtyEl.value) || 1;
  const unit = Number(unitEl.value) || 0;
  const delivery = Number(deliveryEl.dataset.fee) || DELIVERY_FEE;
  const total = (qty * unit) + delivery;

  document.getElementById('co-total').value = total.toFixed(2);
  const paymentMethod = document.getElementById('co-payment').value;

  if (paymentMethod === 'Bkash') {
    document.getElementById('co-pay-now').value = total.toFixed(2);
    document.getElementById('co-due-amount').value = '0.00';
  } else if (paymentMethod === 'Cash on Delivery') {
    document.getElementById('co-pay-now').value = delivery.toFixed(2);
    document.getElementById('co-due-amount').value = (qty * unit).toFixed(2);
    
    const noteEl = document.getElementById('co-note');
    if (noteEl) {
       noteEl.textContent = `Pay delivery charge ৳${delivery.toFixed(2)} to ${COD_NUMBER} via bKash. Remaining on delivery.`;
    }
  }
}

function handlePaymentChange(e) {
  const method = e.target.value;
  const payNowEl = document.getElementById('co-pay-now');
  const dueEl = document.getElementById('co-due-amount');
  const paymentNumberEl = document.getElementById('co-payment-number');
  const txnEl = document.getElementById('co-txn');
  const noteEl = document.getElementById('co-note');

  if (method === 'Bkash') {
    if(paymentNumberEl) paymentNumberEl.value = BKASH_NUMBER;
    if(noteEl) noteEl.textContent = `Send full amount to ${BKASH_NUMBER} and provide transaction ID.`;
    if(txnEl) txnEl.required = true;
    if(payNowEl) payNowEl.style.display = 'block';
    if(dueEl) dueEl.style.display = 'block';
  } else if (method === 'Cash on Delivery') {
    if(paymentNumberEl) paymentNumberEl.value = COD_NUMBER;
    const fee = document.getElementById('co-delivery')?.dataset?.fee || DELIVERY_FEE;
    if(noteEl) noteEl.textContent = `Pay delivery charge ৳${fee} to ${COD_NUMBER} via bKash. Remaining on delivery.`;
    if(txnEl) { txnEl.required = true; txnEl.value = ''; }
    if(payNowEl) payNowEl.style.display = 'block';
    if(dueEl) dueEl.style.display = 'block';
  } else {
    if(paymentNumberEl) paymentNumberEl.value = '';
    if(noteEl) noteEl.textContent = '';
    if(txnEl) { txnEl.required = false; txnEl.value = ''; }
    if(payNowEl) payNowEl.style.display = 'none';
    if(dueEl) dueEl.style.display = 'none';
  }
  updateTotalInModal();
}

// Reusable cart form update function
function updateCartCheckoutTotals() {
  if (!window.cartCheckoutState) return;
  const { subtotal, hasPreOrder } = window.cartCheckoutState;

  const addressEl = document.getElementById('cart-co-address');
  const address = addressEl ? addressEl.value.trim() : '';
  const deliveryFee = calculateDeliveryFee(address);
  
  const deliveryEl = document.getElementById('cart-co-delivery');
  if (deliveryEl) {
      deliveryEl.value = `Delivery Charge = ${deliveryFee}`;
      deliveryEl.dataset.fee = deliveryFee;
  }

  const total = subtotal + deliveryFee;
  const totalEl = document.getElementById('cart-co-total');
  if (totalEl) totalEl.value = total.toFixed(2);

  const methodEl = document.getElementById('cart-co-payment');
  const method = methodEl ? methodEl.value : '';
  
  const payNowEl = document.getElementById('cart-co-pay-now');
  const dueEl = document.getElementById('cart-co-due-amount');
  const numberEl = document.getElementById('cart-co-payment-number');
  const txnEl = document.getElementById('cart-co-txn');
  const noteEl = document.getElementById('cart-co-note');

  if (!payNowEl || !dueEl) return;

  if (hasPreOrder) {
    const upfront = Math.round((subtotal * 0.25) / 5) * 5;
    payNowEl.value = upfront.toFixed(2);
    dueEl.value = (total - upfront).toFixed(2);
    if(numberEl) numberEl.value = BKASH_NUMBER;
    if(noteEl) noteEl.textContent = `Send ৳${upfront} to ${BKASH_NUMBER} and enter transaction ID.`;
    if(txnEl) txnEl.required = true;
  } else if (method === 'Bkash') {
    payNowEl.value = total.toFixed(2);
    dueEl.value = "0.00";
    if(numberEl) numberEl.value = BKASH_NUMBER;
    if(noteEl) noteEl.textContent = `Send full amount ৳${total.toFixed(2)} to ${BKASH_NUMBER} and provide transaction ID.`;
    if(txnEl) txnEl.required = true;
  } else if (method === 'Cash on Delivery') {
    payNowEl.value = deliveryFee.toFixed(2);
    dueEl.value = subtotal.toFixed(2);
    if(numberEl) numberEl.value = COD_NUMBER;
    if(noteEl) noteEl.textContent = `Pay delivery charge ৳${deliveryFee} via bKash. Remaining on delivery.`;
    if(txnEl) {
        txnEl.required = true;
        txnEl.value = '';
    }
  } else {
    if(numberEl) numberEl.value = '';
    if(noteEl) noteEl.textContent = '';
    if(txnEl) txnEl.required = false;
  }
}

// 4. CHECKOUT PAGE LOGIC (Detects Single vs Cart)
async function initCheckoutPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('id');
  const products = await loadProducts();

  if (productId) {
    // ---- SINGLE PRODUCT CHECKOUT PAGE ----
    const p = products.find(x => x.id === productId);
    if (!p) { alert('Product not found.'); window.location.href = 'index.html'; return; }

    const price = p.price === 'TBA' ? 0 : Number(p.price) || 0;
    const discount = Number(p.discount) || 0;
    const unit = price - discount;

    document.getElementById('cart-checkout-form')?.classList.add('hidden');
    document.getElementById('checkout-form')?.classList.remove('hidden');

    if(document.getElementById('co-product-id')) document.getElementById('co-product-id').value = p.id;
    if(document.getElementById('co-product-name')) document.getElementById('co-product-name').value = p.name;
    if(document.getElementById('co-color')) document.getElementById('co-color').value = p.color || '';
    if(document.getElementById('co-price')) document.getElementById('co-price').value = unit.toFixed(2);
    if(document.getElementById('co-unit-price-raw')) document.getElementById('co-unit-price-raw').value = unit.toString();
    if(document.getElementById('co-available-stock')) document.getElementById('co-available-stock').value = String(p.stock);
    
    const deliveryFee = calculateDeliveryFee('');
    if(document.getElementById('co-delivery')) {
      document.getElementById('co-delivery').value = `Delivery Charge = ${deliveryFee}`;
      document.getElementById('co-delivery').dataset.fee = deliveryFee;
    }

    updateTotalInModal();

  } else {
    // ---- CART CHECKOUT PAGE ----
    const cart = getCart();
    if (cart.length === 0) {
      alert('Your cart is empty!');
      window.location.href = 'index.html';
      return;
    }

    document.getElementById('checkout-form')?.classList.add('hidden');
    document.getElementById('cart-checkout-form')?.classList.remove('hidden');

    let subtotal = 0;
    let hasPreOrder = false;

    cart.forEach(item => {
      const p = products.find(pr => pr.id === item.id);
      if (p) {
        const unitPrice = Number(p.price) - Number(p.discount || 0);
        subtotal += unitPrice * item.qty;
        if (p.availability === 'Pre Order') hasPreOrder = true;
      }
    });

    const itemsDiv = document.getElementById('cart-co-items');
    if (itemsDiv) {
      itemsDiv.innerHTML = '<h3 class="font-bold text-lg mb-2 text-on-surface">Order Summary</h3>';
      cart.forEach(item => {
        const p = products.find(pr => pr.id === item.id);
        if(p) {
            const unitPrice = Number(p.price) - Number(p.discount || 0);
            const line = document.createElement('p');
            line.className = "text-xs mb-1 text-slate-300";
            line.innerHTML = `<strong>${item.name}</strong> ${item.color ? '(' + item.color + ')' : ''} × ${item.qty}<br>
                              ৳${unitPrice.toFixed(2)} × ${item.qty} = ৳${(unitPrice * item.qty).toFixed(2)}`;
            itemsDiv.appendChild(line);
        }
      });
    }

    if(document.getElementById('cart-co-payment')) {
      document.getElementById('cart-co-payment').value = hasPreOrder ? 'Bkash' : '';
      document.getElementById('cart-co-payment').disabled = hasPreOrder;
    }
    
    const initialDelivery = calculateDeliveryFee('');
    if(document.getElementById('cart-co-delivery')) {
      document.getElementById('cart-co-delivery').value = `Delivery Charge = ${initialDelivery}`;
      document.getElementById('cart-co-delivery').dataset.fee = initialDelivery;
    }

    window.cartCheckoutState = { subtotal, hasPreOrder };
    updateCartCheckoutTotals();
  }
}

// Single Checkout Submit
async function submitCheckoutOrder(e) {
  e.preventDefault();
  const btn = document.getElementById('place-order-btn');
  if(btn) btn.disabled = true;

  if (!document.getElementById('co-policy').checked) {
    alert('Please agree to the order policy.');
    if(btn) btn.disabled = false;
    return;
  }

  const productId = document.getElementById('co-product-id').value;
  const qty = Number(document.getElementById('co-qty').value);
  const available = Number(document.getElementById('co-available-stock').value);

  if (!productId) { alert('Product ID is missing.'); if(btn) btn.disabled = false; return; }
  if (qty <= 0) { alert('Quantity must be at least 1.'); if(btn) btn.disabled = false; return; }
  if (qty > available && available !== -1) { alert(`Quantity exceeds available stock of ${available}.`); if(btn) btn.disabled = false; return; }

  const unit = Number(document.getElementById('co-unit-price-raw').value);
  if (isNaN(unit)) { alert('Invalid unit price.'); if(btn) btn.disabled = false; return; }

  const delivery = Number(document.getElementById('co-delivery').dataset.fee);
  if (isNaN(delivery)) { alert('Invalid delivery fee.'); if(btn) btn.disabled = false; return; }

  const total = (qty * unit) + delivery;

  const products = await loadProducts();
  const currentProduct = products.find(p => p.id === productId);
  if (!currentProduct) {
    alert('Product not found. Please refresh and try again.');
    if(btn) btn.disabled = false;
    return;
  }

  const orderData = {
    timeISO: new Date().toISOString(),
    productId,
    productName: document.getElementById('co-product-name').value,
    color: document.getElementById('co-color').value,
    unitPrice: unit,
    quantity: qty,
    deliveryFee: delivery,
    total,
    paid: Number(document.getElementById('co-pay-now').value) || 0,
    due: Number(document.getElementById('co-due-amount').value) || 0,
    customerName: document.getElementById('co-name').value.trim(),
    phone: document.getElementById('co-phone').value.trim(),
    address: document.getElementById('co-address').value.trim(),
    paymentMethod: document.getElementById('co-payment').value,
    paymentNumber: document.getElementById('co-payment-number').value.trim(),
    transactionId: document.getElementById('co-txn').value.trim().toUpperCase(),
    status: 'Pending',
    wasPreOrder: currentProduct.availability === 'Pre Order'
  };

  if (!orderData.customerName || !orderData.phone || !orderData.address || !orderData.paymentMethod) {
    alert('Please fill all required fields.');
    if(btn) btn.disabled = false;
    return;
  }

  if ((orderData.paymentMethod === 'Bkash' || orderData.paymentMethod === 'Cash on Delivery') && !orderData.transactionId) {
    alert('Transaction ID is required to verify your payment/delivery charge.');
    if(btn) btn.disabled = false;
    return;
  }

  try {
    await runTransaction(db, async (transaction) => {
      const productRef = doc(db, 'products', productId);
      const productSnap = await transaction.get(productRef);
      if (!productSnap.exists()) throw new Error('Product not found.');

      const data = productSnap.data();
      const currentStock = Number(data.stock);

      if (currentStock !== -1 && data.availability !== 'Pre Order' && currentStock < qty) {
        throw new Error(`Insufficient stock. Only ${currentStock} available.`);
      }

      if (currentStock !== -1 && data.availability !== 'Pre Order') {
        transaction.update(productRef, { stock: currentStock - qty });
      }

      const newOrderRef = doc(collection(db, 'orders'));
      transaction.set(newOrderRef, orderData);
    });

    alert('Order placed successfully!');
    window.location.href = 'index.html'; // Redirect upon completion
  } catch (err) {
    console.error('Error placing order:', err);
    alert('Error placing order: ' + err.message);
  } finally {
    if(btn) btn.disabled = false;
  }
}

// ====== GLOBAL INITIALIZATION ROUTER ======
document.addEventListener('DOMContentLoaded', async () => {
  updateCartUI();

  // Route Identifiers
  const isHome = !!document.getElementById('interest-products');
  const isProducts = !!document.getElementById('products-grid');
  const isProduct = !!document.getElementById('product-section');
  const isCheckout = window.location.pathname.includes('checkout') || !!document.getElementById('checkout-form') || !!document.getElementById('cart-checkout-form');

  if (isHome) await initHomePage();
  if (isProducts) await initProductsPage();
  if (isProduct) await initProductPage();
  if (isCheckout) await initCheckoutPage();

  // Side Cart Triggers
  document.getElementById('cart-link')?.addEventListener('click', () => {
    document.getElementById('cart-slider').classList.remove('hidden');
    document.getElementById('cart-slider').classList.remove('translate-x-full');
  });
  document.getElementById('close-cart')?.addEventListener('click', () => {
    document.getElementById('cart-slider').classList.add('translate-x-full');
  });
  
  // Navigate to Checkout Page from Cart Slider
  document.getElementById('checkout-cart')?.addEventListener('click', () => {
    const cart = getCart();
    if (cart.length === 0) {
      alert('Your cart is empty!');
      return;
    }
    window.location.href = 'checkout.html';
  });

  document.getElementById('close-viewer')?.addEventListener('click', () => {
    document.getElementById('image-viewer').classList.add('hidden');
  });

  // Single Checkout Listeners
  const checkoutForm = document.getElementById('checkout-form');
  if (checkoutForm) checkoutForm.addEventListener('submit', submitCheckoutOrder);

  document.getElementById('co-address')?.addEventListener('input', () => {
    const val = document.getElementById('co-address').value;
    document.getElementById('co-delivery').dataset.fee = calculateDeliveryFee(val);
    updateTotalInModal();
  });
  document.getElementById('co-payment')?.addEventListener('change', handlePaymentChange);
  document.getElementById('co-qty')?.addEventListener('input', updateTotalInModal);

  // Cart Checkout Listeners
  document.getElementById('cart-co-address')?.addEventListener('input', updateCartCheckoutTotals);
  document.getElementById('cart-co-payment')?.addEventListener('change', updateCartCheckoutTotals);

  document.getElementById('cart-checkout-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.querySelector('#cart-checkout-form button[type="submit"]');
    if (!btn) return;
    btn.disabled = true;

    if (!document.getElementById('cart-co-policy').checked) {
      alert('Please agree to the order policy.');
      btn.disabled = false;
      return;
    }

    const cart = getCart();
    if (cart.length === 0) {
      alert('Cart is empty!');
      btn.disabled = false;
      return;
    }

    const products = await loadProducts();
    const deliveryFee = Number(document.getElementById('cart-co-delivery').dataset.fee);
    let subtotal = 0;
    let hasPreOrder = false;

    const items = cart.map(item => {
      const p = products.find(pr => pr.id === item.id);
      if (!p) throw new Error('Product missing');
      const unitPrice = Number(p.price) - Number(p.discount || 0);
      subtotal += unitPrice * item.qty;
      if (p.availability === 'Pre Order') hasPreOrder = true;
      return {
        productId: item.id,
        productName: item.name,
        color: item.color || '',
        unitPrice,
        quantity: item.qty,
        wasPreOrder: p.availability === 'Pre Order'
      };
    });

    const total = subtotal + deliveryFee;
    const paid = Number(document.getElementById('cart-co-pay-now').value) || 0;
    const due = Number(document.getElementById('cart-co-due-amount').value) || 0;

    const orderData = {
      timeISO: new Date().toISOString(),
      items,
      deliveryFee,
      total,
      paid,
      due,
      customerName: document.getElementById('cart-co-name').value.trim(),
      phone: document.getElementById('cart-co-phone').value.trim(),
      address: document.getElementById('cart-co-address').value.trim(),
      paymentMethod: document.getElementById('cart-co-payment').value,
      paymentNumber: document.getElementById('cart-co-payment-number').value.trim(),
      transactionId: document.getElementById('cart-co-txn').value.trim().toUpperCase(),
      status: 'Pending'
    };

    if (!orderData.customerName || !orderData.phone || !orderData.address || !orderData.paymentMethod) {
      alert('Please fill all required fields.');
      btn.disabled = false;
      return;
    }

    // TRANSACTION ID REQUIRED FOR BOTH BKASH AND COD IN CART CHECKOUT
    if ((orderData.paymentMethod === 'Bkash' || orderData.paymentMethod === 'Cash on Delivery') && !orderData.transactionId) {
      alert('Transaction ID is required to verify your payment/delivery charge.');
      btn.disabled = false;
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        const productRefs = items.map(item => doc(db, 'products', item.productId));
        const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));

        for (let i = 0; i < items.length; i++) {
          const snap = productSnaps[i];
          if (!snap.exists()) throw new Error('Product not found');

          const data = snap.data();
          const currentStock = Number(data.stock);
          const item = items[i];

          if (currentStock !== -1 && data.availability !== 'Pre Order' && currentStock < item.quantity) {
            throw new Error(`Not enough stock for ${item.productName}. Only ${currentStock} left.`);
          }

          if (currentStock !== -1 && data.availability !== 'Pre Order') {
            transaction.update(productRefs[i], { stock: currentStock - item.quantity });
          }
        }

        const newOrderRef = doc(collection(db, 'orders'));
        transaction.set(newOrderRef, orderData);
      });

      alert('Order placed successfully!');
      localStorage.removeItem('cart');
      updateCartUI();
      window.location.href = 'index.html'; // Redirect upon completion
    } catch (err) {
      console.error('Error placing order:', err);
      alert('Error placing order: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  });
});
