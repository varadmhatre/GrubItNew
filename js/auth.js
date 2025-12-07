// js/auth.js

// ---------- Helpers ----------
function isValidEmail(email) {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

async function saveUserProfile(user, nameOverride) {
  const ref = db.collection("users").doc(user.uid);
  const snap = await ref.get();

  if (!snap.exists) {
    await ref.set({
      uid: user.uid,
      name: nameOverride || user.displayName || "",
      email: user.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}

// ---------- SIGN UP ----------
async function handleSignup(event) {
  event.preventDefault();

  const name = document.getElementById("signupName").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  const errorBox = document.getElementById("signupError");
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
    await saveUserProfile(cred.user, name);

    window.location.href = "home.html";
  } catch (err) {
    console.error(err);
    // common error if Email/Password is not enabled in Firebase
    errorBox.textContent = err.message || "Signup failed. Please try again.";
  }
}

// ---------- LOGIN ----------
async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorBox = document.getElementById("loginError");
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
    await saveUserProfile(cred.user);

    window.location.href = "home.html";
  } catch (err) {
    console.error(err);
    errorBox.textContent = "Invalid email or password.";
  }
}

// ---------- AUTH GUARD ----------
function setupAuthGuard() {
  auth.onAuthStateChanged((user) => {
    const path = window.location.pathname;
    const page = path.substring(path.lastIndexOf("/") + 1) || "index.html";
    const isAuthPage = (page === "index.html" || page === "signup.html" || page === "");

    if (!user && !isAuthPage) {
      // not logged in, trying to access protected page
      window.location.href = "index.html";
      return;
    }

    if (user && isAuthPage) {
      // logged in but on login/signup → send to home
      window.location.href = "home.html";
      return;
    }

    // show email in header if there's a slot for it
    const emailEl = document.getElementById("currentUserEmail");
    if (emailEl && user) {
      emailEl.textContent = user.email;
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

// ---------- Init per page ----------
document.addEventListener("DOMContentLoaded", () => {
  setupLogout();
  setupAuthGuard();

  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  const signupForm = document.getElementById("signupForm");
  if (signupForm) {
    signupForm.addEventListener("submit", handleSignup);
  }
});
