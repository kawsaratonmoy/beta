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
  const finalPrice = Number(product.discount) > 0 ? (Number(product.price) - Number(product.discount)) : Number(product.price);

  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      id: productId,
      name: product.name,
      color: product.color || '',
      price: finalPrice,
      image: product.images?.[0] || 'logo.png',
      qty: qty,
      isPreOrder: product.availability === 'Pre Order'
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
  if (newQty < 1) { removeFromCart(productId); return; }
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
      <img src="${item.image}" class="w-16 h-16 object-cover rounded-lg bg-surface-container-lowest" onerror="this.src='logo.png'">
      <div class="flex-1 min-w-0">
        <h4 class="text-sm font-bold truncate">${item.name}</h4>
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

    div.querySelector('.qty-minus').addEventListener('click', () => { updateCartQuantity(item.id, item.qty - 1); });
    div.querySelector('.qty-plus').addEventListener('click', () => { updateCartQuantity(item.id, item.qty + 1); });
    div.querySelector('.remove-btn').addEventListener('click', () => { removeFromCart(item.id); });
    itemsContainer.appendChild(div);
  });

  if (totalEl) totalEl.innerHTML = `<strong>Total: ৳${total}</strong>`;
}

// ====== ROUTING TO STANDALONE CHECKOUT PAGE ======
window.initiateCheckout = function(productId = null) {
  if (productId) {
    // Single item instant checkout
    const product = productsMap.get(productId);
    if (!product) return;
    const finalPrice = Number(product.discount) > 0 ? (Number(product.price) - Number(product.discount)) : Number(product.price);
    
    sessionStorage.setItem('checkout_data', JSON.stringify({
      type: 'single',
      items: [{
        id: product.id,
        name: product.name,
        color: product.color || '',
        price: finalPrice,
        image: product.images?.[0] || 'logo.png',
        qty: 1,
        isPreOrder: product.availability === 'Pre Order'
      }]
    }));
  } else {
    // Cart checkout
    const cart = getCart();
    if(cart.length === 0) {
      alert("Cart is empty!");
      return;
    }
    sessionStorage.setItem('checkout_data', JSON.stringify({
      type: 'cart',
      items: cart
    }));
  }
  window.location.href = 'checkout.html';
};


// ====== GLOBAL MAP & UTILS ======
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
  else if (lowerAddr.includes("dhaka")) return 110;
  return 150;
}

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
  if (sameName.length > 1 && p.color) slug += '-' + p.color.toLowerCase().replace(/\s+/g, '-');

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
      <div class="absolute top-4 left-4 right-4 flex flex-wrap z-10">${badgeHTML}</div>
      ${!isOOS && !isUpcoming ? `
      <button class="absolute bottom-4 right-4 w-12 h-12 bg-surface-bright/80 backdrop-blur-md rounded-full flex items-center justify-center text-primary opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0 shadow-2xl z-20" onclick="event.stopPropagation(); window.addToCart('${p.id}'); alert('Added to cart!');">
        <span class="material-symbols-outlined pointer-events-none">add_shopping_cart</span>
      </button>` : ''}
    </div>
    <div class="p-6 cursor-pointer flex-1 flex flex-col justify-between" onclick="window.location.href='product.html?slug=${slug}'">
      <div>
        <div class="flex justify-between items-start mb-2 gap-2">
          <h3 class="text-xl font-bold tracking-tight line-clamp-1">${p.name}</h3>
          <span class="text-primary font-mono font-bold whitespace-nowrap">${isUpcoming ? 'TBA' : '৳' + finalPrice}</span>
        </div>
      </div>
    </div>
  `;
  return card;
}


// ====== PAGE INITIALIZERS ======

async function initHomePage() {
  const productsContainer = document.getElementById('interest-products');
  const products = await loadProducts();
  if (productsContainer) {
    productsContainer.innerHTML = '';
    shuffle(products).slice(0, 8).forEach(p => productsContainer.appendChild(createProductCard(p, products)));
  }
}

async function initProductsPage() {
  const container = document.getElementById('products-grid');
  if (!container) return;
  const products = await loadProducts();
  container.innerHTML = '';
  products.forEach(p => container.appendChild(createProductCard(p, products)));
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

  if (!product) return;

  // DOM bindings
  const mainImg = document.getElementById('main-image');
  if (mainImg) mainImg.src = product.images?.[0] || 'logo.png';

  if (document.getElementById('product-name')) document.getElementById('product-name').textContent = product.name;
  
  const hasDiscount = Number(product.discount) > 0;
  const finalPrice = hasDiscount ? (Number(product.price) - Number(product.discount)) : Number(product.price);
  const priceEl = document.getElementById('product-price');
  if (priceEl) priceEl.innerHTML = `৳${finalPrice.toFixed(2)}`;

  if (document.getElementById('product-detailed-desc')) document.getElementById('product-detailed-desc').innerHTML = product.detailedDescription || '';

  const orderRow = document.getElementById('order-row');
  if (orderRow) {
    orderRow.innerHTML = `
      <button id="btn-buy-now" class="w-full signature-gradient text-on-primary-fixed font-headline font-bold py-5 rounded-xl text-lg hover:brightness-110 transition-all active:scale-95 shadow-xl shadow-purple-500/10">
        ${product.availability === 'Pre Order' ? 'PRE-ORDER NOW' : 'ORDER NOW'}
      </button>
      <button id="btn-add-cart" class="bg-surface-variant/40 backdrop-blur text-on-surface font-headline font-semibold py-5 rounded-xl text-lg hover:bg-surface-variant/60 transition-all active:scale-95">
        ADD TO CART
      </button>
    `;
    document.getElementById('btn-buy-now').onclick = () => window.initiateCheckout(product.id);
    document.getElementById('btn-add-cart').onclick = () => { window.addToCart(product.id); alert('Added to cart!'); };
  }
}

// ====== CHECKOUT PAGE LOGIC ======
async function initCheckoutPage() {
  const checkoutDataStr = sessionStorage.getItem('checkout_data');
  if (!checkoutDataStr) {
    window.location.href = 'index.html';
    return;
  }

  const checkoutData = JSON.parse(checkoutDataStr);
  const itemsList = document.getElementById('co-items-list');
  const isCart = checkoutData.type === 'cart';
  let subtotal = 0;
  let hasPreOrder = false;

  // Render items
  checkoutData.items.forEach(item => {
    subtotal += (item.price * item.qty);
    if (item.isPreOrder) hasPreOrder = true;

    itemsList.innerHTML += `
      <div class="flex gap-4 items-center bg-surface-container-lowest p-3 rounded-xl border border-white/5">
        <img src="${item.image}" class="w-16 h-16 object-cover rounded-lg bg-surface-variant">
        <div class="flex-grow">
          <h4 class="font-headline text-sm font-bold text-on-surface">${item.name}</h4>
          <p class="text-xs text-outline mb-1">Color: ${item.color || 'Base'} | Qty: ${item.qty}</p>
          <span class="text-primary font-mono text-sm font-bold">৳${item.price * item.qty}</span>
        </div>
      </div>
    `;
  });

  document.getElementById('co-subtotal-display').textContent = `৳${subtotal.toFixed(2)}`;

  // Payment Method Handling
  const payBox = document.getElementById('payment-details-box');
  const txnContainer = document.getElementById('txn-container');
  const merchantLabel = document.getElementById('co-merchant-number');
  const paymentNote = document.getElementById('co-payment-note');
  
  const radios = document.querySelectorAll('input[name="payment_method"]');
  
  if (hasPreOrder) {
    document.getElementById('pay-cod').disabled = true;
    document.getElementById('pay-cod').parentElement.classList.add('opacity-30', 'pointer-events-none');
    document.getElementById('pay-bkash').checked = true; // Force Bkash for preorder
  }

  function updateCheckoutTotals() {
    const address = document.getElementById('co-address').value;
    const deliveryFee = calculateDeliveryFee(address);
    document.getElementById('co-delivery-display').textContent = `৳${deliveryFee.toFixed(2)}`;

    const total = subtotal + deliveryFee;
    document.getElementById('co-total-display').textContent = `৳${total.toFixed(2)}`;

    const selectedMethod = document.querySelector('input[name="payment_method"]:checked')?.value;
    
    if (selectedMethod) payBox.classList.remove('hidden');

    if (hasPreOrder) {
      const advance = Math.round((subtotal * 0.25) / 5) * 5;
      document.getElementById('preorder-split-display').classList.remove('hidden');
      document.getElementById('co-advance-display').textContent = `৳${advance.toFixed(2)}`;
      document.getElementById('co-due-display').textContent = `৳${(total - advance).toFixed(2)}`;
      
      merchantLabel.textContent = BKASH_NUMBER;
      txnContainer.classList.remove('hidden');
      paymentNote.textContent = `Please send ৳${advance.toFixed(2)} to ${BKASH_NUMBER} via bKash Send Money to confirm pre-order.`;
    } 
    else if (selectedMethod === 'Bkash') {
      document.getElementById('preorder-split-display').classList.add('hidden');
      merchantLabel.textContent = BKASH_NUMBER;
      txnContainer.classList.remove('hidden');
      paymentNote.textContent = `Please send total ৳${total.toFixed(2)} to ${BKASH_NUMBER} via bKash Send Money.`;
    } 
    else if (selectedMethod === 'Cash on Delivery') {
      document.getElementById('preorder-split-display').classList.add('hidden');
      merchantLabel.textContent = COD_NUMBER;
      txnContainer.classList.add('hidden');
      paymentNote.textContent = `Please send ONLY the delivery charge ৳${deliveryFee.toFixed(2)} to ${COD_NUMBER} via bKash. Subtotal will be collected on delivery.`;
    }
  }

  document.getElementById('co-address').addEventListener('input', updateCheckoutTotals);
  radios.forEach(r => r.addEventListener('change', updateCheckoutTotals));
  
  // Trigger initial calculation
  if(hasPreOrder) updateCheckoutTotals();

  // Submission Logic
  document.getElementById('final-checkout-btn').addEventListener('click', async () => {
    const name = document.getElementById('co-name').value.trim();
    const phone = document.getElementById('co-phone').value.trim();
    const address = document.getElementById('co-address').value.trim();
    const paymentMethod = document.querySelector('input[name="payment_method"]:checked')?.value;
    const txnId = document.getElementById('co-txn').value.trim();
    const policyAccepted = document.getElementById('co-policy').checked;

    if (!name || !phone || !address || !paymentMethod) {
      alert("Please complete all Operative Details and select a Settlement Protocol.");
      return;
    }
    if ((paymentMethod === 'Bkash' || hasPreOrder) && !txnId) {
      alert("Transaction ID is required for bKash payments.");
      return;
    }
    if (!policyAccepted) {
      alert("You must accept the Shipping & Return policies to deploy.");
      return;
    }

    const deliveryFee = calculateDeliveryFee(address);
    const total = subtotal + deliveryFee;
    let paid = 0, due = 0;

    if (hasPreOrder) {
      paid = Math.round((subtotal * 0.25) / 5) * 5;
      due = total - paid;
    } else if (paymentMethod === 'Bkash') {
      paid = total;
      due = 0;
    } else if (paymentMethod === 'Cash on Delivery') {
      paid = deliveryFee;
      due = subtotal;
    }

    const btn = document.getElementById('final-checkout-btn');
    btn.innerHTML = `<span class="material-symbols-outlined animate-spin">sync</span> PROCESSING...`;
    btn.disabled = true;

    try {
      const orderData = {
        timeISO: new Date().toISOString(),
        items: checkoutData.items.map(i => ({
          productId: i.id,
          productName: i.name,
          color: i.color,
          quantity: i.qty,
          unitPrice: i.price,
          wasPreOrder: i.isPreOrder
        })),
        deliveryFee, total, paid, due,
        customerName: name, phone, address,
        paymentMethod,
        paymentNumber: document.getElementById('co-merchant-number').textContent,
        transactionId: txnId.toUpperCase(),
        status: 'Pending'
      };

      const docRef = await addDoc(collection(db, 'orders'), orderData);
      
      // Cleanup & show success
      if (isCart) { localStorage.removeItem('cart'); updateCartUI(); }
      sessionStorage.removeItem('checkout_data');
      
      showOrderConfirmation(docRef.id);

    } catch (err) {
      console.error(err);
      alert("Error generating manifest: " + err.message);
      btn.innerHTML = `AUTHORIZE DEPLOYMENT`;
      btn.disabled = false;
    }
  });
}

function showOrderConfirmation(orderId) {
  const modal = document.createElement('div');
  modal.className = "fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-md opacity-0 transition-opacity duration-500";
  modal.innerHTML = `
    <div class="bg-surface-container-high w-full max-w-sm rounded-2xl overflow-hidden border border-primary/20 shadow-2xl transform scale-95 transition-transform duration-500 text-center flex flex-col items-center p-10">
      <div class="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
        <span class="material-symbols-outlined text-5xl text-primary">verified</span>
      </div>
      <h2 class="font-headline text-3xl font-bold tracking-tighter text-on-surface mb-2">Transmission<br>Successful</h2>
      <p class="text-outline text-sm mb-6 leading-relaxed">Dispatch manifest <span class="text-primary font-mono font-bold">#${orderId.slice(-6).toUpperCase()}</span> has been uploaded to the lattice.</p>
      <button onclick="window.location.href='index.html'" class="w-full signature-gradient text-on-primary-fixed font-headline font-bold py-4 rounded-xl tracking-widest uppercase shadow-lg shadow-purple-500/20 active:scale-[0.98] transition-all">
        Return to Base
      </button>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Trigger animation
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    modal.querySelector('div').classList.remove('scale-95');
  }, 50);
}

// ====== GLOBAL INITIALIZATION ROUTER ======
document.addEventListener('DOMContentLoaded', async () => {
  updateCartUI();

  const isHome = !!document.getElementById('interest-products');
  const isProducts = !!document.getElementById('products-grid');
  const isProduct = !!document.getElementById('product-name');
  const isCheckout = window.location.pathname.includes('checkout.html');

  if (isHome) await initHomePage();
  if (isProducts) await initProductsPage();
  if (isProduct) await initProductPage();
  if (isCheckout) await initCheckoutPage();

  // Sidebar Cart Triggers
  document.getElementById('cart-link')?.addEventListener('click', () => {
    document.getElementById('cart-slider').classList.remove('hidden');
    setTimeout(() => document.getElementById('cart-slider').classList.remove('translate-x-full'), 10);
  });
  document.getElementById('close-cart')?.addEventListener('click', () => {
    document.getElementById('cart-slider').classList.add('translate-x-full');
    setTimeout(() => document.getElementById('cart-slider').classList.add('hidden'), 300);
  });
  
  // Checkout from Cart
  document.getElementById('checkout-cart')?.addEventListener('click', () => {
    window.initiateCheckout();
  });
});
