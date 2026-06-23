import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc, orderBy, query, where, runTransaction } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { firebaseConfig, BKASH_NUMBER, COD_NUMBER, DELIVERY_FEE } from './config.js';

// ====== INITIALIZE FIREBASE ======
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ====== GLOBAL UTILS ======
const productsMap = new Map();

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

function calculateDeliveryFee(address) {
  const lowerAddr = address.toLowerCase();
  if (lowerAddr.includes("savar")) return 70;
  if (lowerAddr.includes("dhaka")) return 110;
  return 150;
}

// ====== CART SYSTEM ======
function getCart() {
  const cart = localStorage.getItem('cart');
  return cart ? JSON.parse(cart) : [];
}

function saveCart(cart) {
  localStorage.setItem('cart', JSON.stringify(cart));
  try {
    updateCartUI();
  } catch (err) {
    console.warn("Cart UI update skipped outside standard store pages:", err);
  }
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
      image: p.images?.[0] || 'logo.png',
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

// ====== STOREFRONT PAGE ROUTERS ======

async function initHomePage() {
  const productsContainer = document.getElementById('interest-products');
  const products = await loadProducts();
  if (products.length === 0) return;

  const heroSection = document.getElementById('hero-section');
  if (heroSection) {
      const randomProduct = products[Math.floor(Math.random() * products.length)];
      const titleParts = randomProduct.name.split(' ');
      const p1 = titleParts.slice(0, 2).join(' ');
      const p2 = titleParts.slice(2).join(' ') || 'EDITION';

      const tagEl = document.getElementById('hero-tag');
      if(tagEl) tagEl.textContent = `Featured ${randomProduct.category || 'Gear'}`;
      
      const titleEl = document.getElementById('hero-title');
      if(titleEl) {
        titleEl.innerHTML = `${p1} <br/><span class="text-transparent bg-clip-text bg-gradient-to-br from-primary to-primary-container">${p2}</span>`;
        titleEl.classList.remove('shimmer', 'text-transparent');
      }

      const descEl = document.getElementById('hero-desc');
      if(descEl) descEl.textContent = randomProduct.description || "Experience premium precision art components.";
      
      const imgEl = document.getElementById('hero-img');
      if(imgEl && randomProduct.images?.[0]) {
        imgEl.src = randomProduct.images[0];
        imgEl.classList.remove('shimmer');
      }
      
      const sameName = products.filter(other => other.name.toLowerCase() === randomProduct.name.toLowerCase());
      let slug = randomProduct.name.toLowerCase().replace(/\s+/g, '-');
      if (sameName.length > 1 && randomProduct.color) slug += '-' + randomProduct.color.toLowerCase().replace(/\s+/g, '-');
      
      const linkEl = document.getElementById('hero-link');
      if(linkEl) linkEl.href = `product.html?slug=${slug}`;
      
      heroSection.classList.remove('opacity-0');
  }

  if (productsContainer) {
    productsContainer.innerHTML = '';
    shuffle(products).slice(0, 8).forEach(p => {
      productsContainer.appendChild(createProductCard(p, products));
    });
  }
}

async function initProductsPage() {
  const container = document.getElementById('products-grid');
  if (!container) return;

  const products = await loadProducts();
  const searchInput = document.getElementById('search-input');
  const sortSelect = document.getElementById('sort-select');
  const categoryContainer = document.getElementById('category-filters-container');

  const categories = ['All', ...new Set(products.map(p => p.category).filter(Boolean))];
  if (categoryContainer) {
    categoryContainer.innerHTML = categories.map(cat => `
      <label class="flex items-center gap-3 cursor-pointer group mb-2">
        <input type="radio" name="cat-filter" value="${cat}" ${cat === 'All' ? 'checked' : ''} class="w-4 h-4 bg-surface-container-lowest border-white/10 text-primary focus:ring-primary focus:ring-offset-surface">
        <span class="text-sm text-outline-variant group-hover:text-on-surface transition-colors">${cat}</span>
      </label>
    `).join('');
  }

  const params = new URLSearchParams(window.location.search);
  const urlCategory = params.get('category');
  if (urlCategory && categoryContainer) {
     const targetRadio = document.querySelector(`input[name="cat-filter"][value="${urlCategory}"]`);
     if (targetRadio) targetRadio.checked = true;
  }

  function renderGrid() {
    let result = [...products];
    if (searchInput && searchInput.value) {
      const q = searchInput.value.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q)));
    }

    const checkedCat = document.querySelector('input[name="cat-filter"]:checked');
    if (checkedCat && checkedCat.value !== 'All') {
      result = result.filter(p => p.category === checkedCat.value);
    }

    if (sortSelect) {
      const sortVal = sortSelect.value;
      if (sortVal === 'price-low') {
        result.sort((a, b) => (Number(a.price) - Number(a.discount || 0)) - (Number(b.price) - Number(b.discount || 0)));
      } else if (sortVal === 'price-high') {
        result.sort((a, b) => (Number(b.price) - Number(b.discount || 0)) - (Number(a.price) - Number(a.discount || 0)));
      }
    }

    container.innerHTML = '';
    if (result.length === 0) {
      container.innerHTML = `<div class="col-span-full text-center py-12 text-outline">No items found matching criteria.</div>`;
      return;
    }
    result.forEach(p => container.appendChild(createProductCard(p, products)));
  }

  if (searchInput) searchInput.addEventListener('input', renderGrid);
  if (sortSelect) sortSelect.addEventListener('change', renderGrid);
  if (categoryContainer) categoryContainer.addEventListener('change', renderGrid);

  renderGrid();
}

async function initProductPage() {
  const params = new URLSearchParams(window.location.search);
  const urlSlug = params.get('slug');
  if (!urlSlug) return;

  const products = await loadProducts();
  let product = null;

  for (const p of products) {
    const sameName = products.filter(other => other.name.toLowerCase() === p.name.toLowerCase());
    let slug = p.name.toLowerCase().replace(/\s+/g, '-');
    if (sameName.length > 1 && p.color) slug += '-' + p.color.toLowerCase().replace(/\s+/g, '-');
    if (slug === urlSlug) { product = p; break; }
  }

  if (!product) { alert('Product not found'); return; }

  document.title = product.metaTitle || product.name;
  const images = product.images || [];
  const mainImg = document.getElementById('main-image');
  if (mainImg) {
    mainImg.src = images[0] || 'logo.png';
    mainImg.onclick = () => {
      const viewerImg = document.getElementById('viewer-img');
      if (viewerImg) viewerImg.src = mainImg.src;
      document.getElementById('image-viewer')?.classList.remove('hidden');
    };
  }

  const thumbGallery = document.getElementById('thumbnail-gallery');
  if (thumbGallery) {
    thumbGallery.innerHTML = '';
    images.slice(0, 4).forEach(src => {
      const wrapper = document.createElement('div');
      wrapper.className = "aspect-square bg-surface-container-high rounded-lg overflow-hidden border border-outline-variant/20 cursor-pointer";
      wrapper.innerHTML = `<img src="${src}" class="w-full h-full object-cover grayscale hover:grayscale-0 transition-all">`;
      wrapper.onclick = () => { if (mainImg) mainImg.src = src; };
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
      orderRow.innerHTML = `<button class="w-full py-5 bg-surface-variant/40 text-slate-400 font-bold rounded-xl cursor-not-allowed" disabled>Upcoming</button>`;
    } else if (Number(product.stock) <= 0 && product.availability !== 'Pre Order') {
      orderRow.innerHTML = `<button class="w-full py-5 bg-red-900/30 text-red-400 font-bold rounded-xl cursor-not-allowed" disabled>Out of Stock</button>`;
    } else {
      orderRow.innerHTML = `
        <button id="btn-buy-now" class="w-full py-5 bg-gradient-to-br from-primary to-primary-container text-on-primary-fixed font-bold rounded-xl flex items-center justify-center gap-3 active:scale-95 duration-150">Order Now</button>
        <button id="btn-add-cart" class="w-full py-5 bg-surface-variant/40 text-primary font-bold rounded-xl border border-outline-variant/20 active:scale-95 duration-150">Add to Cart</button>
      `;
      document.getElementById('btn-buy-now').onclick = () => { window.location.href = `checkout.html?id=${product.id}`; };
      document.getElementById('btn-add-cart').onclick = () => { window.addToCart(product.id); alert('Added to cart!'); };
    }
  }
}

// ====== STANDALONE CHECKOUT ENGINE ======
async function initCheckoutPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const singleProductId = urlParams.get('id');
  const products = await loadProducts();

  let checkoutItems = [];
  let hasPreOrder = false;

  if (singleProductId) {
    const p = products.find(x => x.id === singleProductId);
    if (!p) { alert('Product context error.'); window.location.href = 'index.html'; return; }
    const unitPrice = Number(p.price) - Number(p.discount || 0);
    checkoutItems.push({
      id: p.id, name: p.name, color: p.color || '', price: unitPrice,
      image: p.images?.[0] || 'logo.png', qty: 1, isPreOrder: p.availability === 'Pre Order'
    });
    if (p.availability === 'Pre Order') hasPreOrder = true;
  } else {
    const cart = getCart();
    if (cart.length === 0) { alert('Your cart is empty!'); window.location.href = 'index.html'; return; }
    cart.forEach(item => {
      const p = products.find(pr => pr.id === item.id);
      if (p) {
        item.isPreOrder = p.availability === 'Pre Order';
        if (item.isPreOrder) hasPreOrder = true;
        checkoutItems.push(item);
      }
    });
  }

  const itemsList = document.getElementById('co-items-list');
  let subtotal = 0;
  if (itemsList) {
    itemsList.innerHTML = '';
    checkoutItems.forEach(item => {
      const itemTotal = item.price * item.qty;
      subtotal += itemTotal;
      itemsList.innerHTML += `
        <div class="flex gap-4 items-center bg-surface-container-lowest p-3 rounded-xl border border-white/5">
          <img src="${item.image}" class="w-16 h-16 object-cover rounded-lg bg-surface-variant">
          <div class="flex-grow">
            <h4 class="text-sm font-bold text-on-surface">${item.name}</h4>
            <p class="text-xs text-outline mb-1">Color: ${item.color || 'Base'} | Qty: ${item.qty}</p>
            <span class="text-primary font-mono font-bold">৳${itemTotal.toFixed(2)}</span>
          </div>
        </div>
      `;
    });
  }

  const subtotalDisplay = document.getElementById('co-subtotal-display');
  if (subtotalDisplay) subtotalDisplay.textContent = `৳${subtotal.toFixed(2)}`;

  const bkashRadio = document.getElementById('pay-bkash');
  const codRadio = document.getElementById('pay-cod');
  if (hasPreOrder && codRadio) {
    codRadio.disabled = true;
    codRadio.parentElement?.classList.add('opacity-30', 'pointer-events-none');
    if (bkashRadio) bkashRadio.checked = true;
  }

  function updateCheckoutTotals() {
    const address = document.getElementById('co-address')?.value || '';
    const deliveryFee = calculateDeliveryFee(address);
    
    const deliveryDisplay = document.getElementById('co-delivery-display');
    if(deliveryDisplay) deliveryDisplay.textContent = `৳${deliveryFee.toFixed(2)}`;

    const total = subtotal + deliveryFee;
    const totalDisplay = document.getElementById('co-total-display');
    if(totalDisplay) totalDisplay.textContent = `৳${total.toFixed(2)}`;

    const selectedMethod = document.querySelector('input[name="payment_method"]:checked')?.value;
    const payBox = document.getElementById('payment-details-box');
    const merchantLabel = document.getElementById('co-merchant-number');
    const txnContainer = document.getElementById('txn-container');
    const paymentNote = document.getElementById('co-payment-note');
    const splitDisplay = document.getElementById('preorder-split-display');

    if (payBox) {
      if (selectedMethod || hasPreOrder) payBox.classList.remove('hidden');
      else payBox.classList.add('hidden');
    }

    if (hasPreOrder) {
      const advance = Math.round((subtotal * 0.25) / 5) * 5;
      if(splitDisplay) splitDisplay.classList.remove('hidden');
      if(document.getElementById('co-advance-display')) document.getElementById('co-advance-display').textContent = `৳${advance.toFixed(2)}`;
      if(document.getElementById('co-due-display')) document.getElementById('co-due-display').textContent = `৳${(total - advance).toFixed(2)}`;
      
      if(merchantLabel) merchantLabel.textContent = BKASH_NUMBER;
      if(txnContainer) txnContainer.classList.remove('hidden');
      if(paymentNote) paymentNote.textContent = `Please send 25% advance ৳${advance.toFixed(2)} to ${BKASH_NUMBER} via bKash to confirm your pre-order.`;
    } 
    else if (selectedMethod === 'Bkash') {
      if(splitDisplay) splitDisplay.classList.add('hidden');
      if(merchantLabel) merchantLabel.textContent = BKASH_NUMBER;
      if(txnContainer) txnContainer.classList.remove('hidden');
      if(paymentNote) paymentNote.textContent = `Please send total ৳${total.toFixed(2)} to ${BKASH_NUMBER} via bKash.`;
    } 
    else if (selectedMethod === 'Cash on Delivery') {
      if(splitDisplay) splitDisplay.classList.add('hidden');
      if(merchantLabel) merchantLabel.textContent = COD_NUMBER;
      if(txnContainer) txnContainer.classList.remove('hidden');
      if(paymentNote) paymentNote.textContent = `Please send ONLY delivery charge ৳${deliveryFee.toFixed(2)} to ${COD_NUMBER} via bKash. Balance is collected at delivery.`;
    }
  }

  document.getElementById('co-address')?.addEventListener('input', updateCheckoutTotals);
  document.querySelectorAll('input[name="payment_method"]').forEach(r => r.addEventListener('change', updateCheckoutTotals));
  updateCheckoutTotals();

  const btn = document.getElementById('final-checkout-btn');
  if(btn) {
    btn.addEventListener('click', async () => {
      const name = document.getElementById('co-name')?.value.trim();
      const phone = document.getElementById('co-phone')?.value.trim();
      const address = document.getElementById('co-address')?.value.trim();
      const paymentMethod = document.querySelector('input[name="payment_method"]:checked')?.value;
      const txnId = document.getElementById('co-txn')?.value.trim();
      const policyAccepted = document.getElementById('co-policy')?.checked;

      if (!name || !phone || !address || (!paymentMethod && !hasPreOrder)) {
        alert("Please fill in all layout properties."); return;
      }
      if (!txnId) { alert("Transaction ID required."); return; }
      if (!policyAccepted) { alert("Please accept shipping policies."); return; }

      btn.innerHTML = `PROCESSING...`;
      btn.disabled = true;

      const deliveryFee = calculateDeliveryFee(address);
      const total = subtotal + deliveryFee;
      let paid = 0, due = 0;

      if (hasPreOrder) {
        paid = Math.round((subtotal * 0.25) / 5) * 5; due = total - paid;
      } else if (paymentMethod === 'Bkash') {
        paid = total; due = 0;
      } else if (paymentMethod === 'Cash on Delivery') {
        paid = deliveryFee; due = subtotal;
      }

      try {
        const orderData = {
          timeISO: new Date().toISOString(),
          items: checkoutItems.map(i => ({
              productId: i.id, productName: i.name, color: i.color, quantity: i.qty, unitPrice: i.price, wasPreOrder: i.isPreOrder
          })),
          deliveryFee, total, paid, due, customerName: name, phone, address,
          paymentMethod: paymentMethod || 'Bkash (Pre-Order)',
          paymentNumber: document.getElementById('co-merchant-number')?.textContent || BKASH_NUMBER,
          transactionId: txnId.toUpperCase(), status: 'Pending'
        };

        const docRef = await addDoc(collection(db, 'orders'), orderData);
        if (!singleProductId) { localStorage.removeItem('cart'); updateCartUI(); }
        showOrderConfirmation(docRef.id);
      } catch (err) {
        console.error(err); alert("Checkout pipeline failed: " + err.message);
        btn.innerHTML = `Confirm Order`; btn.disabled = false;
      }
    });
  }
}

function showOrderConfirmation(orderId) {
  const modal = document.createElement('div');
  modal.className = "fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-md";
  modal.innerHTML = `
    <div class="bg-surface-container-high w-full max-w-sm rounded-2xl p-10 text-center border border-primary/20">
      <h2 class="text-3xl font-bold text-on-surface mb-2">Order Confirmed</h2>
      <p class="text-outline text-sm mb-6">Manifest ID: <span class="text-primary font-mono">#${orderId.slice(-6).toUpperCase()}</span></p>
      <button onclick="window.location.href='index.html'" class="w-full bg-primary text-white py-4 rounded-xl font-bold uppercase">Return to Base</button>
    </div>
  `;
  document.body.appendChild(modal);
}

// ====== ADMIN ROUTER / ORDERS MODULE ======
async function initAdminPage() {
  const listContainer = document.getElementById('admin-orders-list');
  if (!listContainer) return; // Exit cleanly if user is not browsing the admin site view

  listContainer.innerHTML = `<div class="p-8 text-center text-outline">Synchronizing array logs...</div>`;

  async function loadAndRenderOrders() {
    try {
      const qRef = query(collection(db, 'orders'), orderBy('timeISO', 'desc'));
      const snap = await getDocs(qRef);
      
      if (snap.empty) {
        listContainer.innerHTML = `<div class="p-8 text-center text-outline">No order manifests compiled in Firestore cloud database.</div>`;
        return;
      }

      listContainer.innerHTML = '';
      snap.forEach((orderDoc) => {
        const o = orderDoc.data();
        const oId = orderDoc.id;
        const dateStr = o.timeISO ? new Date(o.timeISO).toLocaleString() : 'Legacy Log';

        const div = document.createElement('div');
        div.className = "bg-surface-container-low border border-white/5 p-6 rounded-2xl flex flex-col gap-4";
        
        let itemsSummary = (o.items || []).map(i => `${i.productName} (${i.color || 'Base'}) x${i.quantity}`).join(', ');

        div.innerHTML = `
          <div class="flex flex-wrap justify-between items-start gap-4 border-b border-white/5 pb-4">
            <div>
              <span class="text-xs font-mono bg-surface-container-highest text-primary px-3 py-1 rounded-full font-bold">#${oId.slice(-6).toUpperCase()}</span>
              <h3 class="text-lg font-bold mt-2 text-on-surface">${o.customerName || 'Anonymous User'}</h3>
              <p class="text-xs text-outline mt-0.5">${dateStr} | Tel: ${o.phone || '-'}</p>
            </div>
            <div class="flex items-center gap-3">
              <select class="status-select bg-surface-container-lowest border border-white/10 text-on-surface text-sm rounded-xl px-3 py-2 font-bold focus:ring-1 focus:ring-primary outline-none transition-all">
                <option value="Pending" ${o.status === 'Pending' ? 'selected' : ''}>Pending</option>
                <option value="Confirmed" ${o.status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
                <option value="Shipped" ${o.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                <option value="Cancelled" ${o.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
              </select>
            </div>
          </div>
          <div class="text-sm space-y-1 text-on-surface-variant">
            <p><strong>Shipping Terminal Address:</strong> ${o.address || 'No location given.'}</p>
            <p><strong>Item Manifest Summary:</strong> ${itemsSummary || 'Empty package log error.'}</p>
            <p><strong>Payment Strategy:</strong> ${o.paymentMethod || 'Unchecked Protocol'} | Txn: <span class="font-mono text-primary font-bold">${o.transactionId || 'None'}</span></p>
          </div>
          <div class="bg-surface-container-lowest rounded-xl p-4 border border-white/5 flex justify-between items-center text-xs font-semibold">
            <div>
              <p class="text-emerald-400">Paid Amount: ৳${o.paid || 0}</p>
              <p class="text-red-400 mt-0.5">Due Residuals: ৳${o.due || 0}</p>
            </div>
            <div class="flex gap-6 text-outline-variant">
              <div class="text-right">Subtotal:<br>Delivery Charge:<br><strong class="text-on-surface text-sm mt-1 block">Total Revenue:</strong></div>
              <div class="font-mono text-right">৳${o.subtotal || (o.total - o.deliveryFee)}<br>৳${o.deliveryFee}<br><strong class="text-primary text-sm mt-1 block">৳${o.total}</strong></div>
            </div>
          </div>
        `;

        div.querySelector('.status-select').addEventListener('change', async (e) => {
          const newStatus = e.target.value;
          try {
            await updateDoc(doc(db, 'orders', oId), { status: newStatus });
            loadAndRenderOrders();
          } catch(err) { alert("Failed to update status: " + err.message); }
        });

        listContainer.appendChild(div);
      });
    } catch(err) {
      listContainer.innerHTML = `<div class="p-8 text-center text-red-400">Error loading orders: Check if an Index is required by Firebase on 'timeISO'. ${err.message}</div>`;
    }
  }

  loadAndRenderOrders();
}

// ====== GLOBAL INITIALIZATION ROUTER ======
document.addEventListener('DOMContentLoaded', async () => {
  await loadProducts();

  try {
    updateCartUI();
  } catch (err) {
    console.warn("Cart component bypassed on current rendering page logic.");
  }

  // TOP LEVEL GLOBAL UI NAVIGATION BINDINGS (Protected via Optional Chaining)
  document.getElementById('cart-link')?.addEventListener('click', () => {
    const slider = document.getElementById('cart-slider');
    if (slider) { slider.classList.remove('hidden', 'translate-x-full'); }
  });
  
  document.getElementById('close-cart')?.addEventListener('click', () => {
    document.getElementById('cart-slider')?.classList.add('translate-x-full');
  });
  
  document.getElementById('checkout-cart')?.addEventListener('click', () => {
    if (getCart().length === 0) { alert('Your cart is empty!'); return; }
    window.location.href = 'checkout.html';
  });

  document.getElementById('close-viewer')?.addEventListener('click', () => {
    document.getElementById('image-viewer')?.classList.add('hidden');
  });

  // Call the legacy modal hookups safely inside a try-catch to keep execution moving
  try {
    if (typeof setupCartCheckoutModal === 'function') {
      setupCartCheckoutModal();
    }
  } catch (err) {
    console.warn("Cart Modal Hook omitted on this view context:", err);
  }

  // PAGE CONDITIONAL DETECTOR ROUTING
  const isHome = !!document.getElementById('interest-products');
  const isProducts = !!document.getElementById('products-grid');
  const isProduct = !!document.getElementById('product-section') || window.location.pathname.includes('product.html');
  const isCheckoutPage = window.location.pathname.includes('checkout.html') || !!document.getElementById('co-items-list');
  const isAdmin = !!document.getElementById('admin-orders-list');

  if (isHome) { try { await initHomePage(); } catch (e) { console.error(e); } }
  if (isProducts) { try { await initProductsPage(); } catch (e) { console.error(e); } }
  if (isProduct) { try { await initProductPage(); } catch (e) { console.error(e); } }
  if (isCheckoutPage) { try { await initCheckoutPage(); } catch (e) { console.error(e); } }
  if (isAdmin) { try { await initAdminPage(); } catch (e) { console.error(e); } }
});
