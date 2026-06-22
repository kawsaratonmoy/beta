import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc, orderBy, query, where, runTransaction } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { firebaseConfig, BKASH_NUMBER, COD_NUMBER, DELIVERY_FEE } from './config.js';

// ====== INITIALIZE FIREBASE ======
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ====== GLOBAL EVENT: CROSS-PAGE SEARCH NAV ======
document.addEventListener('DOMContentLoaded', () => {
  const globalSearchInput = document.getElementById('global-search-input');
  if (globalSearchInput) {
    globalSearchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && globalSearchInput.value.trim() !== '') {
        window.location.href = `products.html?search=${encodeURIComponent(globalSearchInput.value.trim())}`;
      }
    });
  }
});

// ====== CART SYSTEM ======
function getCart() {
  const cart = localStorage.getItem('cart');
  return cart ? JSON.parse(cart) : [];
}

// ====== ULTIMATE SPECIFICATION PARSER ======
function parseSpecsData(specData) {
  if (!specData) return {};
  if (typeof specData === 'object') return specData; 
  
  if (typeof specData === 'string') {
    let str = specData.trim();
    
    // Check if it's already JSON
    if (str.startsWith('{')) {
      try { return JSON.parse(str); } catch(e) {}
    }
    
    // Check if it even has colons
    if (!str.includes(':')) {
      return { "Details": str };
    }

    const specsObj = {};

    // FORMAT 2: MULTI-LINE STRING (Easiest to parse)
    if (str.includes('\n')) {
      const lines = str.split('\n');
      lines.forEach(line => {
        if (line.includes(':')) {
          const [k, ...v] = line.split(':');
          const key = k.trim().replace(/[^a-zA-Z0-9\- ]/g, ''); // Clean odd characters
          let val = v.join(':').trim();
          val = val.replace(/\?$/, '').trim(); // Remove trailing typos like ?
          
          if (key && val) {
            // Capitalize properly
            const properKey = key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            specsObj[properKey] = val;
          }
        }
      });
      return specsObj;
    }

    // FORMAT 1: SINGLE CONTINUOUS LINE STRING
    const knownKeys = [
      "Material", "Legend", "Printing Process", "Key Count", "Profile", "Layout", 
      "Shine-Through", "Switch Type", "Switches", "Brand", "Model", "Connectivity", 
      "Backlight", "Battery Capacity", "Battery", "Interface", "Weight", "Size", 
      "Features", "Type", "Polling Rate", "Lifespan", "Hotswap", "Hot-swappable", 
      "Color", "Mounting Style", "Case Material", "Plate Material", "Stabilizers", 
      "Compatibility", "Dimensions", "Keycaps", "System Support", "Cable Length", 
      "Software", "Warranty", "Lighting", "Actuation Force", "Bottom Out"
    ];
    
    // Sort descending by length so "Printing Process" matches before "Printing"
    knownKeys.sort((a, b) => b.length - a.length);

    // Escape keys for Regex and find all exact positions of "[Key]:"
    const escapedKeys = knownKeys.map(k => k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|');
    const keyRegex = new RegExp(`\\b(${escapedKeys})\\s*:`, 'gi');
    
    let matches = [];
    let match;
    while ((match = keyRegex.exec(str)) !== null) {
      matches.push({
        key: match[1].trim(),
        index: match.index,
        end: match.index + match[0].length // where the value starts
      });
    }

    // If we found recognized keys, extract the text between them
    if (matches.length > 0) {
      for (let i = 0; i < matches.length; i++) {
        const currentMatch = matches[i];
        const nextMatch = matches[i + 1];
        
        const valueStartIndex = currentMatch.end;
        const valueEndIndex = nextMatch ? nextMatch.index : str.length;
        
        let value = str.substring(valueStartIndex, valueEndIndex).trim();
        value = value.replace(/\?$/, '').trim(); // Clean trailing typos
        
        const properKey = currentMatch.key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        if (value) specsObj[properKey] = value;
      }
      return specsObj;
    }

    // FALLBACK: If string is single-line but uses custom keys not in our list
    const fallbackParts = str.split(':');
    let currentKey = fallbackParts[0].split(' ').pop().trim();
    
    for (let i = 1; i < fallbackParts.length; i++) {
      let seg = fallbackParts[i].trim();
      if (i === fallbackParts.length - 1) {
        specsObj[currentKey.charAt(0).toUpperCase() + currentKey.slice(1)] = seg;
      } else {
        let words = seg.split(/\s+/);
        let nextKey = words.pop();
        specsObj[currentKey.charAt(0).toUpperCase() + currentKey.slice(1)] = words.join(' ').trim();
        currentKey = nextKey;
      }
    }
    return specsObj;
  }
  return {};
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
      id: productId, name: product.name, color: product.color || '', price: finalPrice, image: product.images?.[0] || 'logo.png', qty: qty
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
          <button class="remove-btn text-xs text-red-400 hover:text-red-300 underline">Remove</button>
        </div>
      </div>
    `;
    div.querySelector('.qty-minus').addEventListener('click', () => updateCartQuantity(item.id, item.qty - 1));
    div.querySelector('.qty-plus').addEventListener('click', () => updateCartQuantity(item.id, item.qty + 1));
    div.querySelector('.remove-btn').addEventListener('click', () => removeFromCart(item.id));
    itemsContainer.appendChild(div);
  });

  if (totalEl) totalEl.innerHTML = `<strong>Total: ৳${total}</strong>`;
}

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
      <div class="absolute top-4 left-4 right-4 flex flex-wrap z-10">${badgeHTML}</div>
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

// ====== PRODUCTS FILTER PAGE ======
async function initProductsPage() {
  const container = document.getElementById('products-grid');
  const paginationContainer = document.getElementById('pagination-controls');
  if (!container) return;

  const products = await loadProducts();
  
  const searchInput = document.getElementById('search-input');
  const sortSelect = document.getElementById('sort-select');
  const categoryContainer = document.getElementById('category-filters-container');
  const dynamicSpecContainer = document.getElementById('dynamic-spec-filters');
  const clearFiltersBtn = document.getElementById('clear-filters-btn');

  let currentPage = 1;
  const itemsPerPage = 21;
  let selectedSpecs = {};

  const categories = ['All', ...new Set(products.map(p => p.category).filter(Boolean))];
  
  if (categoryContainer) {
    categoryContainer.innerHTML = categories.map(cat => `
      <label class="flex items-center gap-3 cursor-pointer group py-1.5 px-2 rounded-xl hover:bg-surface-variant/30 transition-colors">
        <input type="radio" name="cat-filter" value="${cat}" ${cat === 'All' ? 'checked' : ''} class="w-3.5 h-3.5 bg-surface-container-lowest border-white/10 text-primary focus:ring-0 focus:ring-offset-0 rounded">
        <span class="text-xs text-outline-variant group-hover:text-on-surface transition-colors">${cat}</span>
      </label>
    `).join('');
  }

  function buildDynamicSpecFiltersUI() {
    if (!dynamicSpecContainer) return;
    const specMap = {}; 
    products.forEach(p => {
      const parsedSpecs = parseSpecsData(p.specs);
      if (Object.keys(parsedSpecs).length > 0 && !parsedSpecs["Details"]) {
        Object.entries(parsedSpecs).forEach(([key, val]) => {
          if (key && val && key.toLowerCase() !== 'id') {
            const formattedKey = key.trim();
            const formattedVal = val.toString().trim();
            if (!specMap[formattedKey]) specMap[formattedKey] = new Set();
            specMap[formattedKey].add(formattedVal);
          }
        });
      }
    });

    dynamicSpecContainer.innerHTML = Object.entries(specMap).map(([specName, uniqueValues]) => {
      if (!selectedSpecs[specName]) selectedSpecs[specName] = [];
      const optionsHTML = Array.from(uniqueValues).map(val => {
        const isChecked = selectedSpecs[specName].includes(val) ? 'checked' : '';
        return `
          <label class="flex items-center gap-3 cursor-pointer group py-1 px-1.5 rounded-lg hover:bg-surface-variant/30 transition-colors">
            <input type="checkbox" data-spec="${specName}" value="${val}" ${isChecked} class="spec-checkbox w-3.5 h-3.5 bg-surface-container-lowest border-white/10 text-primary focus:ring-0 focus:ring-offset-0 rounded-sm">
            <span class="text-xs text-outline-variant group-hover:text-on-surface transition-colors">${val}</span>
          </label>
        `;
      }).join('');
      
      return `
        <div class="space-y-2">
          <label class="text-[10px] font-bold uppercase tracking-widest text-outline block capitalize">${specName}</label>
          <div class="space-y-1 max-h-40 overflow-y-auto pr-1">${optionsHTML}</div>
        </div>
      `;
    }).join('');

    document.querySelectorAll('.spec-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const specName = e.target.getAttribute('data-spec');
        const value = e.target.value;
        if (e.target.checked) {
          if (!selectedSpecs[specName].includes(value)) selectedSpecs[specName].push(value);
        } else {
          selectedSpecs[specName] = selectedSpecs[specName].filter(v => v !== value);
        }
        currentPage = 1;
        renderGrid();
      });
    });
  }

  const params = new URLSearchParams(window.location.search);
  const urlCategory = params.get('category');
  const urlSearch = params.get('search');

  if (urlCategory && categoryContainer) {
     const targetRadio = document.querySelector(`input[name="cat-filter"][value="${urlCategory}"]`);
     if (targetRadio) targetRadio.checked = true;
  }
  if (urlSearch && searchInput) searchInput.value = urlSearch;

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

    Object.entries(selectedSpecs).forEach(([specKey, allowedValues]) => {
      if (allowedValues.length > 0) {
        result = result.filter(p => {
          const parsedSpecs = parseSpecsData(p.specs);
          return parsedSpecs[specKey] && allowedValues.includes(parsedSpecs[specKey].toString().trim());
        });
      }
    });

    if (sortSelect) {
      const sortVal = sortSelect.value;
      if (sortVal === 'price-low') {
        result.sort((a, b) => (Number(a.price) - Number(a.discount || 0)) - (Number(b.price) - Number(b.discount || 0)));
      } else if (sortVal === 'price-high') {
        result.sort((a, b) => (Number(b.price) - Number(b.discount || 0)) - (Number(a.price) - Number(a.discount || 0)));
      }
    }

    const totalPages = Math.ceil(result.length / itemsPerPage);
    if (currentPage > totalPages) currentPage = Math.max(1, totalPages);
    const paginatedItems = result.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    container.innerHTML = '';
    if (result.length === 0) {
      container.innerHTML = `<div class="col-span-full text-center py-12 text-outline bg-surface-container-low rounded-xl border border-white/5">No products found matching your criteria.</div>`;
      if (paginationContainer) paginationContainer.classList.add('hidden');
      return;
    }

    paginatedItems.forEach(p => container.appendChild(createProductCard(p, products)));
    renderPaginationControls(totalPages);
  }

  function renderPaginationControls(totalPages) {
    if (!paginationContainer) return;
    if (totalPages <= 1) {
      paginationContainer.classList.add('hidden');
      return;
    }
    
    paginationContainer.classList.remove('hidden');
    paginationContainer.innerHTML = '';

    const prevBtn = document.createElement('button');
    prevBtn.className = `w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${currentPage === 1 ? 'text-outline/30 cursor-not-allowed' : 'text-outline hover:text-primary bg-surface-container-low hover:bg-surface-container border border-white/5'}`;
    prevBtn.innerHTML = `<span class="material-symbols-outlined">chevron_left</span>`;
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => { currentPage--; renderGrid(); window.scrollTo({top: 0, behavior: 'smooth'}); };
    paginationContainer.appendChild(prevBtn);

    for (let i = 1; i <= totalPages; i++) {
      const pageBtn = document.createElement('button');
      pageBtn.className = `w-10 h-10 flex items-center justify-center font-black rounded-lg transition-all ${currentPage === i ? 'bg-primary text-on-primary-fixed shadow-lg shadow-primary/20' : 'text-outline hover:text-primary bg-surface-container-low hover:bg-surface-container border border-white/5'}`;
      pageBtn.textContent = i;
      pageBtn.onclick = () => { currentPage = i; renderGrid(); window.scrollTo({top: 0, behavior: 'smooth'}); };
      paginationContainer.appendChild(pageBtn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = `w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${currentPage === totalPages ? 'text-outline/30 cursor-not-allowed' : 'text-outline hover:text-primary bg-surface-container-low hover:bg-surface-container border border-white/5'}`;
    nextBtn.innerHTML = `<span class="material-symbols-outlined">chevron_right</span>`;
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => { currentPage++; renderGrid(); window.scrollTo({top: 0, behavior: 'smooth'}); };
    paginationContainer.appendChild(nextBtn);
  }

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (sortSelect) sortSelect.value = 'latest';
      const rootRadio = document.querySelector('input[name="cat-filter"][value="All"]');
      if (rootRadio) rootRadio.checked = true;
      selectedSpecs = {};
      currentPage = 1;
      buildDynamicSpecFiltersUI();
      renderGrid();
    });
  }

  if (searchInput) searchInput.addEventListener('input', () => { currentPage = 1; renderGrid(); });
  if (sortSelect) sortSelect.addEventListener('change', () => { currentPage = 1; renderGrid(); });
  if (categoryContainer) categoryContainer.addEventListener('change', () => { currentPage = 1; renderGrid(); });

  buildDynamicSpecFiltersUI();
  renderGrid();
}

// ====== PRODUCT DETAILS PAGE ======
async function initProductPage() {
  const params = new URLSearchParams(window.location.search);
  const urlSlug = params.get('slug');
  if (!urlSlug || !document.getElementById('product-section')) return;

  const products = await loadProducts();
  let product = null;

  for (const p of products) {
    const sameName = products.filter(other => other.name.toLowerCase() === p.name.toLowerCase());
    let slug = p.name.toLowerCase().replace(/\s+/g, '-');
    if (sameName.length > 1 && p.color) slug += '-' + p.color.toLowerCase().replace(/\s+/g, '-');
    if (slug === urlSlug) { product = p; break; }
  }

  if (!product) {
    document.getElementById('product-section').innerHTML = `<div class="col-span-full text-center py-20 text-outline">Product not found in inventory.</div>`;
    return;
  }

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
  
  const badgesContainer = document.getElementById('product-badges');
  if (badgesContainer) {
    badgesContainer.innerHTML = '';
    if (product.hotDeal) badgesContainer.innerHTML += `<span class="bg-primary-container text-on-primary-container text-[10px] font-bold px-3 py-1 rounded-full tracking-widest uppercase">Hot Deal</span>`;
    if (product.availability === 'Pre Order') badgesContainer.innerHTML += `<span class="bg-purple-600 text-white text-[10px] font-bold px-3 py-1 rounded-full tracking-widest uppercase">Pre Order</span>`;
    badgesContainer.innerHTML += `<span class="bg-surface-container-highest text-primary text-[10px] font-bold px-3 py-1 rounded-full tracking-widest uppercase">${product.availability || 'In Stock'}</span>`;
  }
  
  const isUpcoming = product.availability === 'Upcoming';
  const hasDiscount = Number(product.discount) > 0;
  const price = Number(product.price) || 0;
  const finalPrice = hasDiscount ? (price - Number(product.discount)) : price;
  
  const priceEl = document.getElementById('product-price');
  if (priceEl) priceEl.innerHTML = isUpcoming ? 'TBA' : `${hasDiscount ? `<s class="text-slate-500 text-xl mr-2">৳${price.toFixed(2)}</s> ` : ''}৳${finalPrice.toFixed(2)}`;

  const metaDescEl = document.getElementById('product-meta-desc');
  if (metaDescEl) metaDescEl.textContent = product.metaDescription || product.description || 'No brief summary available for this item.';

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
      document.getElementById('btn-buy-now').onclick = () => { window.location.href = `checkout.html?id=${product.id}`; };
      document.getElementById('btn-add-cart').onclick = () => { window.addToCart(product.id); alert('Added to cart!'); };
    }
  }

  if (document.getElementById('product-detailed-desc')) {
    document.getElementById('product-detailed-desc').innerHTML = product.detailedDescription || product.description || '<p>No detailed background information available.</p>';
  }

  // Right Section: Clean UI Specification Table Engine
  const specsGrid = document.getElementById('product-specs-grid');
  if (specsGrid) {
    specsGrid.innerHTML = '';
    const parsedSpecs = parseSpecsData(product.specs);
    
    // Check if the parser gave us detailed keys or just a general block of text
    if (Object.keys(parsedSpecs).length > 0 && !parsedSpecs["Details"]) {
      Object.entries(parsedSpecs).forEach(([key, value]) => {
        if (key.toLowerCase() !== 'id' && value.trim() !== '') {
          specsGrid.innerHTML += `
            <div class="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center py-4 border-b border-white/5 last:border-0 gap-2 sm:gap-4">
              <span class="text-slate-400 font-medium whitespace-nowrap">${key}</span>
              <span class="font-display font-medium text-left sm:text-right text-slate-200">${value}</span>
            </div>`;
        }
      });
    } else if (parsedSpecs["Details"]) {
      // If it couldn't parse the format properly, print the entire block safely
      specsGrid.innerHTML = `<div class="text-slate-300 text-sm leading-relaxed">${parsedSpecs["Details"]}</div>`;
    } else {
      // Absolute Fallback
      specsGrid.innerHTML = `
        <div class="flex justify-between items-center py-3 border-b border-white/5">
          <span class="text-slate-400 font-medium">Category</span>
          <span class="font-display font-medium text-right text-slate-200">${product.category || 'N/A'}</span>
        </div>
      `;
    }
  }

  const otherSection = document.getElementById('other-products');
  if (otherSection) {
    otherSection.innerHTML = '';
    const eligible = products.filter(p => p.availability !== 'Upcoming' && p.id !== product.id);
    shuffle(eligible).slice(0, 4).forEach(p => otherSection.appendChild(createProductCard(p, products)));
  }
}

// ====== HOME & CHECKOUT PAGE INITIALIZERS ======
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

      if(document.getElementById('hero-tag')) document.getElementById('hero-tag').textContent = `Featured ${randomProduct.category || 'Gear'}`;
      if(document.getElementById('hero-title')) {
        document.getElementById('hero-title').innerHTML = `${p1} <br/><span class="text-transparent bg-clip-text bg-gradient-to-br from-primary to-primary-container">${p2}</span>`;
        document.getElementById('hero-title').classList.remove('shimmer', 'text-transparent');
      }
      if(document.getElementById('hero-desc')) document.getElementById('hero-desc').textContent = randomProduct.description || "Experience premium mechanical artistry.";
      
      const imgEl = document.getElementById('hero-img');
      if(imgEl && randomProduct.images && randomProduct.images[0]) {
        imgEl.src = randomProduct.images[0];
        imgEl.classList.remove('shimmer');
      }
      
      const sameName = products.filter(other => other.name.toLowerCase() === randomProduct.name.toLowerCase());
      let slug = randomProduct.name.toLowerCase().replace(/\s+/g, '-');
      if (sameName.length > 1 && randomProduct.color) slug += '-' + randomProduct.color.toLowerCase().replace(/\s+/g, '-');
      
      if(document.getElementById('hero-link')) document.getElementById('hero-link').href = `product.html?slug=${slug}`;
      heroSection.classList.remove('opacity-0');
  }

  if (productsContainer) {
    productsContainer.innerHTML = ''; 
    shuffle(products).slice(0, 8).forEach(p => productsContainer.appendChild(createProductCard(p, products)));
  }
}

async function initCheckoutPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const singleProductId = urlParams.get('id');
  const products = await loadProducts();

  let checkoutItems = [];
  let hasPreOrder = false;

  if (singleProductId) {
    const p = products.find(x => x.id === singleProductId);
    if (!p) { alert('Product not found.'); window.location.href = 'index.html'; return; }
    const unitPrice = Number(p.price) - Number(p.discount || 0);
    checkoutItems.push({ id: p.id, name: p.name, color: p.color || '', price: unitPrice, image: p.images?.[0] || 'logo.png', qty: 1, isPreOrder: p.availability === 'Pre Order' });
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
            <h4 class="font-headline text-sm font-bold text-on-surface">${item.name}</h4>
            <p class="text-xs text-outline mb-1">Color: ${item.color || 'Base'} | Qty: ${item.qty}</p>
            <span class="text-primary font-mono text-sm font-bold">৳${itemTotal.toFixed(2)}</span>
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
    codRadio.parentElement.classList.add('opacity-30', 'pointer-events-none');
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

    if (selectedMethod && payBox) payBox.classList.remove('hidden');

    if (hasPreOrder) {
      const advance = Math.round((subtotal * 0.25) / 5) * 5;
      if(splitDisplay) splitDisplay.classList.remove('hidden');
      if(document.getElementById('co-advance-display')) document.getElementById('co-advance-display').textContent = `৳${advance.toFixed(2)}`;
      if(document.getElementById('co-due-display')) document.getElementById('co-due-display').textContent = `৳${(total - advance).toFixed(2)}`;
      if(merchantLabel) merchantLabel.textContent = BKASH_NUMBER;
      if(txnContainer) txnContainer.classList.remove('hidden');
      if(paymentNote) paymentNote.textContent = `Please send 25% advance ৳${advance.toFixed(2)} to ${BKASH_NUMBER} via bKash Send Money.`;
    } 
    else if (selectedMethod === 'Bkash') {
      if(splitDisplay) splitDisplay.classList.add('hidden');
      if(merchantLabel) merchantLabel.textContent = BKASH_NUMBER;
      if(txnContainer) txnContainer.classList.remove('hidden');
      if(paymentNote) paymentNote.textContent = `Please send total ৳${total.toFixed(2)} to ${BKASH_NUMBER} via bKash Send Money.`;
    } 
    else if (selectedMethod === 'Cash on Delivery') {
      if(splitDisplay) splitDisplay.classList.add('hidden');
      if(merchantLabel) merchantLabel.textContent = COD_NUMBER;
      if(txnContainer) txnContainer.classList.remove('hidden');
      if(paymentNote) paymentNote.textContent = `Please send ONLY delivery charge ৳${deliveryFee.toFixed(2)} to ${COD_NUMBER} via bKash Send Money.`;
    }
  }

  document.getElementById('co-address')?.addEventListener('input', updateCheckoutTotals);
  document.querySelectorAll('input[name="payment_method"]').forEach(r => r.addEventListener('change', updateCheckoutTotals));
  updateCheckoutTotals();

  const btn = document.getElementById('final-checkout-btn');
  if(btn) {
    btn.addEventListener('click', async () => {
      const name = document.getElementById('co-name').value.trim();
      const phone = document.getElementById('co-phone').value.trim();
      const address = document.getElementById('co-address').value.trim();
      const paymentMethod = document.querySelector('input[name="payment_method"]:checked')?.value;
      const txnId = document.getElementById('co-txn').value.trim();
      const policyAccepted = document.getElementById('co-policy')?.checked;

      if (!name || !phone || !address || !paymentMethod) { alert("Please complete all details."); return; }
      if ((paymentMethod === 'Bkash' || paymentMethod === 'Cash on Delivery') && !txnId) { alert("TXN ID required."); return; }
      if (!policyAccepted) { alert("Accept policies to deploy."); return; }

      btn.innerHTML = `<span class="material-symbols-outlined animate-spin">sync</span> PROCESSING...`;
      btn.disabled = true;

      const deliveryFee = calculateDeliveryFee(address);
      const total = subtotal + deliveryFee;
      let paid = 0, due = 0;

      if (hasPreOrder) { paid = Math.round((subtotal * 0.25) / 5) * 5; due = total - paid; }
      else if (paymentMethod === 'Bkash') { paid = total; due = 0; }
      else if (paymentMethod === 'Cash on Delivery') { paid = deliveryFee; due = subtotal; }

      try {
        const orderData = {
          timeISO: new Date().toISOString(),
          items: checkoutItems.map(i => ({ productId: i.id, productName: i.name, color: i.color, quantity: i.qty, unitPrice: i.price, wasPreOrder: i.isPreOrder })),
          deliveryFee, total, paid, due, customerName: name, phone, address, paymentMethod,
          paymentNumber: document.getElementById('co-merchant-number').textContent, transactionId: txnId.toUpperCase(), status: 'Pending'
        };

        const docRef = await addDoc(collection(db, 'orders'), orderData);
        if (!singleProductId) { localStorage.removeItem('cart'); updateCartUI(); }
        showOrderConfirmation(docRef.id);
      } catch (err) {
        console.error(err);
        alert("Error generating manifest: " + err.message);
        btn.innerHTML = `<span class="material-symbols-outlined">rocket_launch</span> Authorize Deployment`;
        btn.disabled = false;
      }
    });
  }
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
      <p class="text-outline text-sm mb-6 leading-relaxed">Dispatch manifest <span class="text-primary font-mono font-bold">#${orderId.slice(-6).toUpperCase()}</span> uploaded.</p>
      <button onclick="window.location.href='index.html'" class="w-full bg-primary text-white font-headline font-bold py-4 rounded-xl tracking-widest uppercase shadow-lg shadow-purple-500/20 active:scale-[0.98] transition-all">
        Return to Base
      </button>
    </div>
  `;
  document.body.appendChild(modal);
  setTimeout(() => { modal.classList.remove('opacity-0'); modal.querySelector('div').classList.remove('scale-95'); }, 50);
}

// ====== GLOBAL INITIALIZATION ROUTER ======
document.addEventListener('DOMContentLoaded', async () => {
  updateCartUI();

  document.getElementById('cart-link')?.addEventListener('click', () => {
    const slider = document.getElementById('cart-slider');
    if (slider) { slider.classList.remove('hidden'); slider.classList.remove('translate-x-full'); }
  });
  
  document.getElementById('close-cart')?.addEventListener('click', () => {
    const slider = document.getElementById('cart-slider');
    if (slider) slider.classList.add('translate-x-full');
  });
  
  document.getElementById('checkout-cart')?.addEventListener('click', () => {
    if (getCart().length === 0) { alert('Your cart is empty!'); return; }
    window.location.href = 'checkout.html';
  });

  document.getElementById('close-viewer')?.addEventListener('click', () => {
    document.getElementById('image-viewer')?.classList.add('hidden');
  });

  const isHome = !!document.getElementById('interest-products');
  const isProducts = !!document.getElementById('products-grid');
  const isProduct = !!document.getElementById('product-section');
  const isCheckoutPage = window.location.pathname.includes('checkout.html');

  if (isHome) await initHomePage();
  if (isProducts) await initProductsPage();
  if (isProduct) await initProductPage();
  if (isCheckoutPage) await initCheckoutPage();
});
