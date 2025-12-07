// js/app.js

let currentUser = null;

// track user globally
auth.onAuthStateChanged((user) => {
  currentUser = user || null;
  if (user && typeof onUserReady === "function") {
    onUserReady(user);
  }
});

/* ----------------- PRODUCTS ----------------- */

// Load products into a container
async function loadProducts(containerId, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let ref = db.collection("products");
  if (options.publishedOnly) {
    ref = ref.where("published", "==", true);
  }
  if (options.category) {
    ref = ref.where("category", "==", options.category);
  }

  const snap = await ref.orderBy("createdAt", "desc").get();
  container.innerHTML = "";

  if (snap.empty) {
    container.innerHTML = "<p>No products yet.</p>";
    return;
  }

  snap.forEach((doc) => {
    const p = doc.data();
    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
      <img src="${p.imageUrl}" alt="${p.title}">
      <h3>${p.title}</h3>
      <p class="price">₹${p.price}</p>
      <div class="card-actions">
        <button class="btn btn-outline view-product-btn" data-id="${doc.id}">
          View
        </button>
        <button class="btn btn-primary add-to-cart-btn" data-id="${doc.id}">
          Add
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  container.addEventListener("click", (e) => {
    const viewBtn = e.target.closest(".view-product-btn");
    const addBtn = e.target.closest(".add-to-cart-btn");

    if (viewBtn) {
      const id = viewBtn.dataset.id;
      window.location.href = `product.html?id=${id}`;
    }
    if (addBtn) {
      addToCart(addBtn.dataset.id);
    }
  });
}

/* ----------------- PRODUCT DETAIL ----------------- */

async function loadProductDetail() {
  const detail = document.getElementById("productDetail");
  if (!detail) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  if (!id) {
    detail.textContent = "Product not found.";
    return;
  }

  const doc = await db.collection("products").doc(id).get();
  if (!doc.exists) {
    detail.textContent = "Product not found.";
    return;
  }

  const p = doc.data();
  detail.innerHTML = `
    <div class="product-detail-main">
      <img src="${p.imageUrl}" alt="${p.title}">
      <div>
        <h1>${p.title}</h1>
        <p class="price">₹${p.price}</p>
        <p>${p.description || ""}</p>
        <div class="qty-row">
          <button id="qtyMinus">-</button>
          <span id="qtyValue">1</span>
          <button id="qtyPlus">+</button>
        </div>
        <button id="addToCartDetail" class="btn btn-primary">
          Add to Cart
        </button>
      </div>
    </div>
  `;

  let qty = 1;
  document.getElementById("qtyMinus").onclick = () => {
    qty = Math.max(1, qty - 1);
    document.getElementById("qtyValue").textContent = qty;
  };
  document.getElementById("qtyPlus").onclick = () => {
    qty += 1;
    document.getElementById("qtyValue").textContent = qty;
  };
  document.getElementById("addToCartDetail").onclick = () => {
    addToCart(id, qty);
  };
}

/* ----------------- CART ----------------- */

// carts collection: doc = user.uid { items: {productId: qty} }

async function addToCart(productId, qty = 1) {
  if (!currentUser) {
    alert("Please login first.");
    window.location.href = "index.html";
    return;
  }

  const cartRef = db.collection("carts").doc(currentUser.uid);
  await db.runTransaction(async (t) => {
    const snap = await t.get(cartRef);
    let data = snap.exists ? snap.data() : { items: {} };
    if (!data.items[productId]) data.items[productId] = 0;
    data.items[productId] += qty;
    t.set(cartRef, data);
  });
  alert("Added to cart.");
}

async function loadCart() {
  const list = document.getElementById("cartItems");
  const summary = document.getElementById("cartSummary");
  if (!list || !summary || !currentUser) return;

  const cartSnap = await db.collection("carts").doc(currentUser.uid).get();
  const items = cartSnap.exists ? cartSnap.data().items : {};
  const ids = Object.keys(items);

  if (!ids.length) {
    list.innerHTML = "<p>Your cart is empty.</p>";
    summary.innerHTML = "";
    return;
  }

  const refs = ids.map((id) => db.collection("products").doc(id));
  const productSnaps = await firebase.firestore().getAll(...refs);

  list.innerHTML = "";
  let total = 0;

  productSnaps.forEach((doc) => {
    if (!doc.exists) return;
    const p = doc.data();
    const qty = items[doc.id];
    const line = p.price * qty;
    total += line;

    const row = document.createElement("div");
    row.className = "cart-row";
    row.innerHTML = `
      <div>
        <h3>${p.title}</h3>
        <p>₹${p.price} × ${qty}</p>
      </div>
      <button class="btn btn-outline remove-item-btn" data-id="${doc.id}">
        Remove
      </button>
    `;
    list.appendChild(row);
  });

  const taxes = total * 0.08;
  const delivery = 20;
  const grand = total + delivery + taxes;

  summary.innerHTML = `
    <p>Item Total: ₹${total.toFixed(2)}</p>
    <p>Delivery Fee: ₹${delivery.toFixed(2)}</p>
    <p>Taxes &amp; Charges: ₹${taxes.toFixed(2)}</p>
    <h3>Grand Total: ₹${grand.toFixed(2)}</h3>
    <button id="checkoutBtn" class="btn btn-primary">
      Proceed to Checkout
    </button>
  `;

  list.onclick = async (e) => {
    const btn = e.target.closest(".remove-item-btn");
    if (!btn) return;
    const id = btn.dataset.id;
    const cartRef = db.collection("carts").doc(currentUser.uid);
    await db.runTransaction(async (t) => {
      const snap = await t.get(cartRef);
      if (!snap.exists) return;
      const data = snap.data();
      delete data.items[id];
      t.set(cartRef, data);
    });
    loadCart();
  };

  document.getElementById("checkoutBtn").onclick = createOrderFromCart;
}

/* ----------------- ORDERS ----------------- */

async function createOrderFromCart() {
  const cartRef = db.collection("carts").doc(currentUser.uid);
  const cartSnap = await cartRef.get();
  if (!cartSnap.exists || !Object.keys(cartSnap.data().items).length) {
    alert("Cart empty.");
    return;
  }

  const orderRef = db.collection("orders").doc();
  await orderRef.set({
    userId: currentUser.uid,
    items: cartSnap.data().items,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    status: "confirmed"
  });

  await cartRef.delete();
  window.location.href = `orders.html?id=${orderRef.id}`;
}

async function loadOrderDetail() {
  const container = document.getElementById("orderDetail");
  if (!container) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (!id) {
    container.textContent = "Order not found.";
    return;
  }

  const orderSnap = await db.collection("orders").doc(id).get();
  if (!orderSnap.exists) {
    container.textContent = "Order not found.";
    return;
  }

  const order = orderSnap.data();
  const items = order.items || {};
  const ids = Object.keys(items);

  const refs = ids.map((pid) => db.collection("products").doc(pid));
  const productSnaps = ids.length
    ? await firebase.firestore().getAll(...refs)
    : [];

  let rows = "";
  let total = 0;

  productSnaps.forEach((doc) => {
    if (!doc.exists) return;
    const p = doc.data();
    const qty = items[doc.id];
    const line = p.price * qty;
    total += line;
    rows += `<li>${p.title} × ${qty} — ₹${line.toFixed(2)}</li>`;
  });

  const taxes = total * 0.08;
  const delivery = 20;
  const grand = total + delivery + taxes;

  container.innerHTML = `
    <div class="order-shell">
      <h1>Thank you, your order is confirmed!</h1>
      <p>Your order <strong>#${id}</strong> has been placed successfully.</p>
      <hr style="margin:16px 0;">
      <h2>Order Summary</h2>
      <ul style="margin:10px 0 10px 20px;">${rows}</ul>
      <p>Items: ₹${total.toFixed(2)}</p>
      <p>Delivery: ₹${delivery.toFixed(2)}</p>
      <p>Taxes &amp; Charges: ₹${taxes.toFixed(2)}</p>
      <h3>Total: ₹${grand.toFixed(2)}</h3>
      <div style="margin-top:18px;">
        <a href="home.html" class="btn btn-outline">Continue Shopping</a>
      </div>
    </div>
  `;
}

/* ----------------- PROFILE ----------------- */

async function loadUserProfile() {
  const profileBox = document.getElementById("profileBox");
  if (!profileBox || !currentUser) return;

  const snap = await db.collection("users").doc(currentUser.uid).get();
  const data = snap.exists ? snap.data() : {};

  profileBox.innerHTML = `
    <p><strong>Full Name:</strong> ${data.name || ""}</p>
    <p><strong>Email:</strong> ${data.email || currentUser.email}</p>
  `;
}

/* ----------------- SETTINGS ----------------- */

async function loadSettings() {
  const notifForm = document.getElementById("notifForm");
  if (!notifForm || !currentUser) return;

  const ref = db.collection("userSettings").doc(currentUser.uid);
  const snap = await ref.get();
  const settings = snap.exists ? snap.data() : {};

  ["orderUpdates", "promotions", "appAnnouncements", "orderSummaries", "weeklyNewsletter"]
    .forEach((key) => {
      const el = document.getElementById(key);
      if (el) el.checked = settings[key] ?? true;
    });

  notifForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      orderUpdates: document.getElementById("orderUpdates").checked,
      promotions: document.getElementById("promotions").checked,
      appAnnouncements: document.getElementById("appAnnouncements").checked,
      orderSummaries: document.getElementById("orderSummaries").checked,
      weeklyNewsletter: document.getElementById("weeklyNewsletter").checked
    };
    await ref.set(data);
    alert("Notification settings saved.");
  });
}

/* ----------------- SELLER DASHBOARD ----------------- */

async function loadSellerProducts() {
  const tableBody = document.getElementById("sellerProductsBody");
  if (!tableBody || !currentUser) return;

  const snap = await db
    .collection("products")
    .where("createdBy", "==", currentUser.uid)
    .orderBy("createdAt", "desc")
    .get();

  tableBody.innerHTML = "";

  if (snap.empty) {
    tableBody.innerHTML = `<tr><td colspan="5">No products yet.</td></tr>`;
    return;
  }

  snap.forEach((doc) => {
    const p = doc.data();
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${p.title}</td>
      <td>₹${p.price}</td>
      <td>${p.category || "-"}</td>
      <td>
        <span class="badge ${p.published ? "badge-green" : "badge-gray"}">
          ${p.published ? "Published" : "Draft"}
        </span>
      </td>
      <td>
        <button class="btn btn-outline toggle-publish-btn" data-id="${doc.id}">
          ${p.published ? "Unpublish" : "Publish"}
        </button>
      </td>
    `;
    tableBody.appendChild(row);
  });

  tableBody.onclick = async (e) => {
    const btn = e.target.closest(".toggle-publish-btn");
    if (!btn) return;
    const id = btn.dataset.id;
    const ref = db.collection("products").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return;
    const published = !!snap.data().published;
    await ref.update({ published: !published });
    loadSellerProducts();
  };
}

async function initSellerPage() {
  const form = document.getElementById("productForm");
  if (!form || !currentUser) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("pTitle").value.trim();
    const price = parseFloat(document.getElementById("pPrice").value);
    const category = document.getElementById("pCategory").value.trim();
    const imageUrl = document.getElementById("pImage").value.trim();
    const desc = document.getElementById("pDesc").value.trim();

    if (!title || !imageUrl || isNaN(price)) {
      alert("Please fill title, price and image.");
      return;
    }

    await db.collection("products").add({
      title,
      price,
      category,
      imageUrl,
      description: desc,
      published: true,
      createdBy: currentUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    form.reset();
    loadSellerProducts();
  });

  loadSellerProducts();
}

/* ----------------- SEARCH PAGE ----------------- */

async function initSearchPage() {
  const results = document.getElementById("searchResults");
  const input = document.getElementById("searchInput");
  if (!results || !input) return;

  // Load all published once, then filter on client
  const snap = await db
    .collection("products")
    .where("published", "==", true)
    .get();

  const allProducts = [];
  snap.forEach((doc) => allProducts.push({ id: doc.id, ...doc.data() }));

  function render(list) {
    results.innerHTML = "";
    if (!list.length) {
      results.innerHTML = "<p>No items found.</p>";
      return;
    }

    list.forEach((p) => {
      const card = document.createElement("div");
      card.className = "product-card";
      card.innerHTML = `
        <img src="${p.imageUrl}" alt="${p.title}">
        <h3>${p.title}</h3>
        <p class="price">₹${p.price}</p>
        <div class="card-actions">
          <button class="btn btn-outline view-product-btn" data-id="${p.id}">View</button>
          <button class="btn btn-primary add-to-cart-btn" data-id="${p.id}">Add</button>
        </div>
      `;
      results.appendChild(card);
    });
  }

  render(allProducts);

  input.addEventListener("input", () => {
    const q = input.value.toLowerCase();
    const filtered = allProducts.filter((p) =>
      p.title.toLowerCase().includes(q)
    );
    render(filtered);
  });

  results.onclick = (e) => {
    const view = e.target.closest(".view-product-btn");
    const add = e.target.closest(".add-to-cart-btn");
    if (view) {
      window.location.href = `product.html?id=${view.dataset.id}`;
    }
    if (add) {
      addToCart(add.dataset.id);
    }
  };
}

/* ----------------- HOME PAGE INIT ----------------- */

async function initHomePage() {
  await loadProducts("bestsellerList", { publishedOnly: true });
}

/* ----------------- GENERIC PAGE BOOTSTRAP ----------------- */

document.addEventListener("DOMContentLoaded", () => {
  const body = document.body;
  const page = body.getAttribute("data-page");

  if (!page) return;

  switch (page) {
    case "home":
      requireAuth();
      initHomePage();
      break;
    case "product":
      requireAuth();
      loadProductDetail();
      break;
    case "cart":
      requireAuth();
      loadCart();
      break;
    case "orders":
      requireAuth();
      loadOrderDetail();
      break;
    case "profile":
      requireAuth();
      loadUserProfile();
      break;
    case "settings":
      requireAuth();
      loadSettings();
      break;
    case "seller":
      requireAuth();
      initSellerPage();
      break;
    case "search":
      requireAuth();
      initSearchPage();
      break;
    default:
      break;
  }
});
