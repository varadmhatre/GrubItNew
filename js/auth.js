// js/auth.js

// Simple email format check (front-end cannot 100% prove an email exists)
function isValidEmail(email) {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

// Save user profile in Firestore
async function saveUser(user, extraName) {
  const ref = db.collection("users").doc(user.uid);
  const snap = await ref.get();

  if (!snap.exists) {
    await ref.set({
      uid: user.uid,
      name: extraName || user.displayName || "",
      email: user.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}

// ---------- SIGN UP WITH EMAIL & PASSWORD ----------
async function handleSignup(event) {
  event.preventDefault();

  const nameEl = document.getElementById("signupName");
  const emailEl = document.getElementById("signupEmail");
  const passEl = document.getElementById("signupPassword");
  const errorBox = document.getElementById("signupError");

  const name = nameEl.value.trim();
  const email = emailEl.value.trim();
  const password = passEl.value;

  errorBox.textContent = "";

  if (!name) {
    errorBox.textContent = "Please enter your full name.";
    return;
  }

  if (!isValidEmail(email)) {
    errorBox.textContent = "Please enter a valid email address.";
    return;
  }

  if (password.length < 6) {
    errorBox.textContent = "Password must be at least 6 characters.";
    return;
  }

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });
    await saveUser(cred.user, name);

    // logged in → go to home
    window.location.href = "home.html";
  } catch (err) {
    console.error(err);
    errorBox.textContent = err.message || "Signup failed. Try again.";
  }
}

// ---------- LOGIN WITH EMAIL & PASSWORD ----------
async function handleLogin(event) {
  event.preventDefault();

  const emailEl = document.getElementById("loginEmail");
  const passEl = document.getElementById("loginPassword");
  const errorBox = document.getElementById("loginError");

  const email = emailEl.value.trim();
  const password = passEl.value;

  errorBox.textContent = "";

  if (!isValidEmail(email)) {
    errorBox.textContent = "Please enter a valid email address.";
    return;
  }

  if (!password) {
    errorBox.textContent = "Please enter your password.";
    return;
  }

  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    await saveUser(cred.user);

    window.location.href = "home.html";
  } catch (err) {
    console.error(err);
    errorBox.textContent = "Invalid email or password.";
  }
}

// ---------- AUTH GUARD ----------
function requireAuth() {
  auth.onAuthStateChanged((user) => {
    const path = window.location.pathname;
    const page = path.substring(path.lastIndexOf("/") + 1) || "index.html";

    if (!user) {
      // Not logged in → kick out of all pages except login/signup
      if (page !== "index.html" && page !== "signup.html") {
        window.location.href = "index.html";
      }
    } else {
      // Already logged in but on auth pages → send to home
      if (page === "index.html" || page === "signup.html") {
        window.location.href = "home.html";
      }

      const emailEl = document.getElementById("currentUserEmail");
      if (emailEl) emailEl.textContent = user.email;
    }
  });
}

// ---------- LOGOUT ----------
function setupLogout() {
  const btn = document.getElementById("logoutBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    await auth.signOut();
    window.location.href = "index.html";
  });
}

// ---------- INIT LISTENERS ----------
document.addEventListener("DOMContentLoaded", () => {
  setupLogout();

  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  const signupForm = document.getElementById("signupForm");
  if (signupForm) {
    signupForm.addEventListener("submit", handleSignup);
  }

  // Start auth guard on every page
  requireAuth();
});
