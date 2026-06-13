import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc, orderBy, query, where, runTransaction } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { firebaseConfig, BKASH_NUMBER, COD_NUMBER, DELIVERY_FEE } from './config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Status explanations
const statusExplanations = {
  Pending: 'Order received, waiting for processing.',
  Processing: 'Your order is being prepared.',
  Dispatched: 'Your order has been shipped.',
  Delivered: 'Your order has been delivered.',
  Cancelled: 'Your order has been cancelled.'
};

// Status colors
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

function addToCart(productId, qty = 1) {
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
      image: product.images?.[0] || '',
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
  if (countEl) {
    countEl.textContent = cart.reduce((sum, i) => sum + i.qty, 0);
  }

  const itemsContainer = document.getElementById('cart-items');
  const totalEl = document.getElementById('cart-total');
  const emptyMsg = document.getElementById('cart-empty');
  if (!itemsContainer) return;

  if (cart.length === 0) {
    itemsContainer.innerHTML = '';
    if (totalEl) totalEl.innerHTML = '<strong>Total: ৳0</strong>';
    if (emptyMsg) emptyMsg.style.display = 'block';
    return;
  }

  if (emptyMsg) emptyMsg.style.display = 'none';
  itemsContainer.innerHTML = '';
  let total = 0;

  cart.forEach(item => {
    const itemTotal = item.price * item.qty;
    total += itemTotal;

    const div = document.createElement('div');
    div.className = 'cart-item';

    div.innerHTML = `
      <img src="${item.image}" alt="${item.name}" onerror="this.style.display='none'">
      <div class="cart-item-info">
        <h4>${item.name}</h4>
        <div class="muted">Color: ${item.color || '-'}</div>
        <div>৳${item.price} × ${item.qty} = ৳${itemTotal}</div>
        <div class="cart-item-controls">
          <button class="qty-minus" title="Decrease">-</button>
          <span class="qty-display">${item.qty}</span>
          <button class="qty-plus" title="Increase">+</button>
          <button class="remove-btn" title="Remove item">🗑️</button>
        </div>
      </div>
    `;

    const minusBtn = div.querySelector('.qty-minus');
    const plusBtn = div.querySelector('.qty-plus');
    const removeBtn = div.querySelector('.remove-btn');
    const qtyDisplay = div.querySelector('.qty-display');

    minusBtn.addEventListener('click', () => {
      updateCartQuantity(item.id, item.qty - 1);
      qtyDisplay.textContent = Math.max(1, item.qty - 1);
    });

    plusBtn.addEventListener('click', () => {
      updateCartQuantity(item.id, item.qty + 1);
      qtyDisplay.textContent = item.qty + 1;
    });

    removeBtn.addEventListener('click', () => {
      removeFromCart(item.id);
    });

    itemsContainer.appendChild(div);
  });

  if (totalEl) totalEl.innerHTML = `<strong>Total: ৳${total}</strong>`;
}

// Global products map for cart
const productsMap = new Map();

// Categories for home
const categories = [
  { name: 'Keycaps', bg: 'k.png' },
  { name: 'Switches', bg: 's.png' },
  { name: 'Keyboard and Mouse', bg: 'k&b.png' },
  { name: 'Accessories and Collectables', bg: 'c&a.png' }
];

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

async function loadOrders() {
  try {
    const q = query(collection(db, 'orders'), orderBy('timeISO', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error('Error loading orders:', err);
    return [];
  }
}

function shuffle(array) {
  return array.slice().sort(() => Math.random() - 0.5);
}

// ====== SHIMMER PLACEHOLDERS ======
function createShimmerCard() {
  const card = document.createElement('div');
  card.className = 'card product-card shimmer-placeholder';
  card.innerHTML = `
    <div class="shimmer-image"></div>
    <div class="shimmer-badges">
      <div class="shimmer-badge"></div>
      <div class="shimmer-badge"></div>
    </div>
    <div class="shimmer-title"></div>
    <div class="shimmer-muted"></div>
    <div class="shimmer-price"></div>
    <div class="shimmer-button"></div>
  `;
  return card;
}

function createMainImageShimmer() {
  const img = document.createElement('div');
  img.className = 'shimmer-image-placeholder';
  return img;
}

// ====== PRODUCT CARD ======
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
  card.className = 'card product-card';
  card.innerHTML = `
    <img src="${images[0] || ''}" alt="${p.name}" onerror="this.src=''; this.alt='Image not available';">
    <div class="badges">
      ${p.hotDeal ? `<span class="badge hot">HOT DEAL</span>` : ''}
      ${isInStock ? `<span class="badge new">IN STOCK</span>` : ''}
      ${isOOS ? `<span class="badge oos">OUT OF STOCK</span>` : ''}
      ${isUpcoming ? `<span class="badge upcoming">UPCOMING</span>` : ''}
      ${isPreOrder ? `<span class="badge preorder">PRE ORDER</span>` : ''}
    </div>
    <h3>${p.name}</h3>
    <div class="muted">Color: ${p.color || '-'}</div>
    <div class="price">
      ${isUpcoming ? `TBA` : `${hasDiscount ? `<s>৳${price.toFixed(2)}</s> ` : ``}৳${finalPrice.toFixed(2)}`}
    </div>
    <button class="view-details-btn">View Details</button>
  `;
  card.querySelector('.view-details-btn').addEventListener('click', () => {
    window.location.href = `product.html?slug=${slug}`;
  });
  return card;
}

function createCategoryCard(c) {
  const card = document.createElement('div');
  card.className = 'card category-card';
  card.style.backgroundImage = `url(${c.bg})`;
  card.innerHTML = `<h3>${c.name}</h3>`;
  card.addEventListener('click', () => {
    window.location.href = `products.html?category=${encodeURIComponent(c.name)}`;
  });
  return card;
}

// ====== IMAGE VIEWER ======
function setupImageViewer() {
  const viewer = document.getElementById('image-viewer');
  const viewerImg = document.getElementById('viewer-img');
  const closeViewer = document.getElementById('close-viewer');

  if (!viewer || !viewerImg || !closeViewer) return;

  document.querySelectorAll('.product-card img, #main-image').forEach(img => {
    img.style.cursor = 'pointer';
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      viewerImg.src = img.src;
      viewerImg.alt = img.alt;
      viewer.classList.add('show');
    });
  });

  viewer.addEventListener('click', (e) => {
    if (e.target === viewer) {
      viewer.classList.remove('show');
      viewer.classList.remove('zoomed');
    }
  });

  closeViewer.addEventListener('click', () => {
    viewer.classList.remove('show');
    viewer.classList.remove('zoomed');
  });

  viewerImg.addEventListener('dblclick', () => {
    viewer.classList.toggle('zoomed');
  });
}

// ====== DELIVERY CHARGE LOGIC ======
function calculateDeliveryFee(address) {
  const lowerAddr = address.toLowerCase();
  if (lowerAddr.includes("savar")) return 70;
  else if (lowerAddr.includes("dhaka")) return 110;
  return 150;
}

function updateDeliveryCharge() {
  const address = document.getElementById('co-address').value.trim();
  const deliveryFee = calculateDeliveryFee(address);
  document.getElementById('co-delivery').value = `Delivery Charge = ${deliveryFee}`;
  document.getElementById('co-delivery').dataset.fee = deliveryFee;
  updateTotalInModal();
}

// ====== CHECKOUT MODAL FLOW (SINGLE PRODUCT) ======
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
  document.getElementById('co-qty').value = 1;
  document.getElementById('co-qty').max = p.stock;
  document.getElementById('co-payment').value = isPreOrder ? 'Bkash' : '';
  document.getElementById('co-payment').disabled = isPreOrder;
  document.getElementById('co-payment-number').value = '';
  document.getElementById('co-txn').value = '';
  document.getElementById('co-name').value = '';
  document.getElementById('co-phone').value = '';
  document.getElementById('co-address').value = '';
  document.getElementById('co-note').textContent = '';
  document.getElementById('co-policy').checked = false;
  document.getElementById('co-pay-now').style.display = 'none';
  document.getElementById('co-due-amount').style.display = 'none';

  const deliveryFee = calculateDeliveryFee('');
  document.getElementById('co-delivery').value = `Delivery Charge = ${deliveryFee}`;
  document.getElementById('co-delivery').dataset.fee = deliveryFee;

  if (isPreOrder) {
    const preOrderPrice = Math.round((unit * 0.25) / 5) * 5;
    document.getElementById('co-pay-now').value = preOrderPrice.toFixed(2);
    document.getElementById('co-due-amount').value = (unit - preOrderPrice + deliveryFee).toFixed(2);
    document.getElementById('co-payment-number').value = BKASH_NUMBER;
    document.getElementById('co-note').textContent = `Send ৳${preOrderPrice} to ${BKASH_NUMBER} and enter transaction ID`;
    document.getElementById('co-pay-now').style.display = 'block';
    document.getElementById('co-due-amount').style.display = 'block';
  }

  document.getElementById('co-total').value = 'Calculating...';
  document.getElementById('checkout-modal').classList.add('show');
  updateTotalInModal();
}

function closeCheckoutModal() {
  document.getElementById('checkout-modal').classList.remove('show');
}

function handlePaymentChange(e) {
  const method = e.target.value;
  const payNowEl = document.getElementById('co-pay-now');
  const dueEl = document.getElementById('co-due-amount');
  const paymentNumberEl = document.getElementById('co-payment-number');
  const txnEl = document.getElementById('co-txn');
  const noteEl = document.getElementById('co-note');

  if (method === 'Bkash') {
    paymentNumberEl.value = BKASH_NUMBER;
    noteEl.textContent = `Send full amount to ${BKASH_NUMBER} and provide transaction ID.`;
    txnEl.required = true;
    payNowEl.style.display = 'block';
    dueEl.style.display = 'block';
  } else if (method === 'Cash on Delivery') {
    paymentNumberEl.value = COD_NUMBER;
    noteEl.textContent = `Pay delivery charge to ${COD_NUMBER}. Remaining on delivery.`;
    txnEl.required = false;
    txnEl.value = '';
    payNowEl.style.display = 'block';
    dueEl.style.display = 'block';
  } else {
    paymentNumberEl.value = '';
    noteEl.textContent = '';
    txnEl.required = false;
    txnEl.value = '';
    payNowEl.style.display = 'none';
    dueEl.style.display = 'none';
  }
  updateTotalInModal();
}

function updateTotalInModal() {
  const qty = Number(document.getElementById('co-qty').value) || 1;
  const unit = Number(document.getElementById('co-unit-price-raw').value) || 0;
  const delivery = Number(document.getElementById('co-delivery').dataset.fee) || DELIVERY_FEE;
  const subtotal = qty * unit;
  const total = subtotal + delivery;

  document.getElementById('co-total').value = total.toFixed(2);

  const paymentMethod = document.getElementById('co-payment').value;
  const isPreOrderMode = document.getElementById('co-payment').disabled;
  const payNowEl = document.getElementById('co-pay-now');
  const dueEl = document.getElementById('co-due-amount');

  if (isPreOrderMode) {
    const upfront = Math.round((subtotal * 0.25) / 5) * 5;
    payNowEl.value = upfront.toFixed(2);
    dueEl.value = (total - upfront).toFixed(2);
  } else if (paymentMethod === 'Bkash') {
    payNowEl.value = total.toFixed(2);
    dueEl.value = '0.00';
  } else if (paymentMethod === 'Cash on Delivery') {
    payNowEl.value = delivery.toFixed(2);
    dueEl.value = subtotal.toFixed(2);
  }
}

async function submitCheckoutOrder(e) {
  e.preventDefault();
  const btn = document.getElementById('place-order-btn');
  if (btn) btn.disabled = true;

  if (!document.getElementById('co-policy').checked) {
    alert('Please agree to the order policy.');
    if (btn) btn.disabled = false;
    return;
  }

  const productId = document.getElementById('co-product-id').value;
  const qty = Number(document.getElementById('co-qty').value);
  const available = Number(document.getElementById('co-available-stock').value);

  if (!productId) { alert('Product ID is missing.'); if (btn) btn.disabled = false; return; }
  if (qty <= 0) { alert('Quantity must be at least 1.'); if (btn) btn.disabled = false; return; }
  if (qty > available && available !== -1) { alert(`Quantity exceeds available stock of ${available}.`); if (btn) btn.disabled = false; return; }

  const unit = Number(document.getElementById('co-unit-price-raw').value);
  if (isNaN(unit)) { alert('Invalid unit price.'); if (btn) btn.disabled = false; return; }

  const delivery = Number(document.getElementById('co-delivery').dataset.fee);
  if (isNaN(delivery)) { alert('Invalid delivery fee.'); if (btn) btn.disabled = false; return; }

  const total = (qty * unit) + delivery;

  const products = await loadProducts();
  const currentProduct = products.find(p => p.id === productId);
  if (!currentProduct) {
    alert('Product not found. Please refresh and try again.');
    if (btn) btn.disabled = false;
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
    if (btn) btn.disabled = false;
    return;
  }

  if (orderData.paymentMethod === 'Bkash' && !orderData.transactionId) {
    alert('Transaction ID is required for Bkash payment.');
    if (btn) btn.disabled = false;
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
    closeCheckoutModal();
  } catch (err) {
    console.error('Error placing order:', err);
    alert('Error placing order: ' + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ====== FILTER FUNCTIONS ======
function getUniqueValues(products, key) {
  return [...new Set(products.map(p => p[key]).filter(Boolean))].sort();
}

function extractSpecsFromDescription(description) {
  if (!description || typeof description !== 'string') return {};

  const specs = {
    keys: null,
    print: null,
    layout: null,
    profile: null
  };

  const lowerDesc = description.toLowerCase();
  const lines = lowerDesc.split('\n').map(l => l.trim()).filter(Boolean);

  function assign(label, value) {
    const l = label.toLowerCase();
    if (l.includes('key')) specs.keys = value;
    else if (l.includes('print') || l.includes('legend')) specs.print = value;
    else if (l.includes('layout')) specs.layout = value;
    else if (l.includes('profile') || l.includes('height')) specs.profile = value;
  }

  for (const line of lines) {
    let match = line.match(/^([\w\s&()-]+?)\s*:\s*(.+)$/);
    if (match) {
      const label = match[1].trim();
      const value = match[2].trim();
      assign(label, value);
      continue;
    }

    if (/\d+\s*keys?/.test(line)) {
      const m = line.match(/(\d+)\s*keys?/);
      if (m) specs.keys = m[1] + ' keys';
    }
    else if (/original height profile/.test(line)) {
      specs.profile = 'Original height profile';
    }
    else if (/(cherry|oem|mt3|sa|kag|kak|dcs|gmk)/.test(line)) {
      specs.profile = line.match(/(cherry|oem|mt3|sa|kag|kak|dcs|gmk)/i)?.[0] || 'Custom profile';
    }
    else if (/(iso|ansi)/.test(line)) {
      if (/iso.*ansi|ansi.*iso|iso ?\/ ?ansi|iso ?& ?ansi/.test(line)) {
        specs.layout = 'ISO/ANSI';
      } else if (/iso/.test(line)) {
        specs.layout = 'ISO';
      } else if (/ansi/.test(line)) {
        specs.layout = 'ANSI';
      }
    }
    else if (/(print|legend|dye.?sub|double.?shot|shine.?through|shine through|side print|face print)/.test(line)) {
      if (/multi ?legend|multi-legend/.test(line)) {
        specs.print = 'Multi legend';
      } else if (/dye.?sub/.test(line)) {
        specs.print = 'Dye-Sub';
      } else if (/double.?shot/.test(line)) {
        specs.print = 'Double-shot';
      } else if (/shine.?through|shine through/.test(line)) {
        specs.print = 'Shine-through';
      } else if (/side print/.test(line)) {
        specs.print = 'Side print';
      } else if (/face print/.test(line)) {
        specs.print = 'Face print';
      }
    }
  }

  return specs;
}

function getUniqueSpecs(products, specKey) {
  const values = products
    .map(p => {
      if (p.specs && p.specs[specKey]) return p.specs[specKey];
      const parsed = extractSpecsFromDescription(p.description || '');
      return parsed[specKey] || null;
    })
    .filter(Boolean);
  return [...new Set(values)].sort();
}

function renderFilters(products) {
  const prices = products.map(p => Number(p.price) - Number(p.discount || 0)).filter(n => n > 0);
  const minPrice = Math.min(...prices) || 0;
  const maxPrice = Math.max(...prices) || 10000;

  const minSlider = document.getElementById('price-min-slider');
  const maxSlider = document.getElementById('price-max-slider');
  const minInput = document.getElementById('price-min-input');
  const maxInput = document.getElementById('price-max-input');

  if (minSlider && maxSlider && minInput && maxInput) {
    minSlider.min = minPrice;
    minSlider.max = maxPrice;
    minSlider.value = minPrice;
    maxSlider.min = minPrice;
    maxSlider.max = maxPrice;
    maxSlider.value = maxPrice;
    minInput.value = minPrice;
    maxInput.value = maxPrice;

    minSlider.addEventListener('input', () => {
      if (parseInt(minSlider.value) > parseInt(maxSlider.value)) minSlider.value = maxSlider.value;
      minInput.value = minSlider.value;
    });
    maxSlider.addEventListener('input', () => {
      if (parseInt(maxSlider.value) < parseInt(minSlider.value)) maxSlider.value = minSlider.value;
      maxInput.value = maxSlider.value;
    });
    minInput.addEventListener('input', () => {
      minSlider.value = Math.min(Math.max(minInput.value, minPrice), maxSlider.value);
    });
    maxInput.addEventListener('input', () => {
      maxSlider.value = Math.max(Math.min(maxInput.value, maxPrice), minSlider.value);
    });
  }

  const colors = getUniqueValues(products, 'color');
  const colorOptions = document.getElementById('color-options');
  if (colorOptions) {
    colorOptions.innerHTML = colors.map(color => `
      <label><input type="checkbox" class="filter-checkbox" data-type="color" value="${color}"> ${color}</label>
    `).join('');
  }

  const specsFilter = document.getElementById('specs-filter');
  if (specsFilter) {
    specsFilter.style.display = 'block';
    ['keys', 'print', 'layout', 'profile'].forEach(spec => {
      const opts = getUniqueSpecs(products, spec);
      const container = document.getElementById(`${spec}-options`);
      if (container) {
        if (opts.length === 0) {
          container.style.display = 'none';
        } else {
          container.style.display = 'block';
          container.innerHTML = `<h4>${spec.charAt(0).toUpperCase() + spec.slice(1)}</h4>` + opts.map(val => `
            <label><input type="checkbox" class="filter-checkbox" data-type="${spec}" value="${val}"> ${val}</label>
          `).join('');
        }
      }
    });
  }
}

function applyFilters(products) {
  const minSlider = document.getElementById('price-min-slider');
  const maxSlider = document.getElementById('price-max-slider');
  const minPrice = minSlider ? (parseInt(minSlider.value) || 0) : 0;
  const maxPrice = maxSlider ? (parseInt(maxSlider.value) || Infinity) : Infinity;

  const selectedColors = [...document.querySelectorAll('.filter-checkbox[data-type="color"]:checked')].map(cb => cb.value);
  const selectedSpecs = {};
  ['keys', 'print', 'layout', 'profile'].forEach(spec => {
    selectedSpecs[spec] = [...document.querySelectorAll(`.filter-checkbox[data-type="${spec}"]:checked`)].map(cb => cb.value);
  });

  const filtered = products.filter(p => {
    const price = Number(p.price) - Number(p.discount || 0);
    if (price < minPrice || price > maxPrice) return false;
    if (selectedColors.length > 0 && !selectedColors.includes(p.color)) return false;
    const parsedSpecs = extractSpecsFromDescription(p.description || '');
    for (const spec in selectedSpecs) {
      if (selectedSpecs[spec].length > 0 && !selectedSpecs[spec].includes(parsedSpecs[spec])) return false;
    }
    return true;
  });

  const container = document.getElementById('product-list') || document.getElementById('categoryProducts');
  if (container) {
    container.innerHTML = '';
    filtered.forEach(p => container.appendChild(createProductCard(p, products)));
  }
}

function setupFilterListeners(products) {
  document.getElementById('filter-btn')?.addEventListener('click', () => {
    document.getElementById('filter-sidebar').classList.add('open');
  });
  document.getElementById('close-filter')?.addEventListener('click', () => {
    document.getElementById('filter-sidebar').classList.remove('open');
  });
  document.getElementById('apply-filter')?.addEventListener('click', () => {
    applyFilters(products);
    document.getElementById('filter-sidebar').classList.remove('open');
  });
}

// ====== ROUTE CONTROLLERS ======
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

  // UI Construction Logic for Single Product View Details
  const titleEl = document.querySelector('title');
  if (titleEl) titleEl.textContent = product.name;

  const pName = document.getElementById('p-name');
  if (pName) pName.textContent = product.name;

  const pPrice = document.getElementById('p-price');
  if (pPrice) {
    const price = Number(product.price) || 0;
    const disc = Number(product.discount) || 0;
    pPrice.textContent = disc > 0 ? `৳${(price - disc).toFixed(2)}` : `৳${price.toFixed(2)}`;
  }

  const pDesc = document.getElementById('p-desc');
  if (pDesc) pDesc.textContent = product.description || '';

  const buyBtn = document.getElementById('buy-now-btn');
  if (buyBtn) {
    buyBtn.addEventListener('click', () => {
      openCheckoutModal(product.id, product.availability === 'Pre Order');
    });
  }
}

async function initHomePage() {
  const products = await loadProducts();
  const container = document.getElementById('featured-products');
  if (!container) return;
  container.innerHTML = '';
  shuffle(products).slice(0, 8).forEach(p => {
    container.appendChild(createProductCard(p, products));
  });
}

async function initProductsPage() {
  const products = await loadProducts();
  const container = document.getElementById('product-list');
  if (!container) return;
  container.innerHTML = '';
  products.forEach(p => {
    container.appendChild(createProductCard(p, products));
  });
  renderFilters(products);
  setupFilterListeners(products);
}

// ====== GLOBAL EVENT LOOP INITIALIZATION ======
document.addEventListener('DOMContentLoaded', async () => {
  updateCartUI();
  setupImageViewer();

  const isHome = !!document.getElementById('featured-products');
  const isProducts = !!document.getElementById('product-list');
  const isProduct = !!document.getElementById('p-name');

  if (isHome) await initHomePage();
  if (isProducts) await initProductsPage();
  if (isProduct) await initProductPage();

  const checkoutForm = document.getElementById('checkout-form');
  if (checkoutForm) checkoutForm.addEventListener('submit', submitCheckoutOrder);

  const coPayment = document.getElementById('co-payment');
  if (coPayment) coPayment.addEventListener('change', handlePaymentChange);

  const coAddress = document.getElementById('co-address');
  if (coAddress) coAddress.addEventListener('input', updateDeliveryCharge);

  const coQty = document.getElementById('co-qty');
  if (coQty) coQty.addEventListener('input', updateTotalInModal);

  const closeCoBtn = document.getElementById('close-checkout');
  if (closeCoBtn) closeCoBtn.addEventListener('click', closeCheckoutModal);
});
