// js/auth.js

function isGmail(email) {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email) && email.toLowerCase().endsWith("@gmail.com");
}

async function saveUser(user) {
  const ref = db.collection("users").doc(user.uid);
  const snap = await ref.get();

  if (!snap.exists) {
    await ref.set({
      uid: user.uid,
      name: user.displayName || "",
      email: user.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}

async function googleLogin() {
  const provider = new firebase.auth.GoogleAuthProvider();

  try {
    const res = await auth.signInWithPopup(provider);
    const user = res.user;

    if (!user.email || !isGmail(user.email)) {
      alert("Please login with a valid Gmail address.");
      await auth.signOut();
      return;
    }

    await saveUser(user);
    window.location.href = "home.html";
  } catch (err) {
    console.error(err);
    alert("Login failed. Please try again.");
  }
}

function requireAuth() {
  auth.onAuthStateChanged((user) => {
    const path = window.location.pathname;
    const page = path.substring(path.lastIndexOf("/") + 1);

    if (!user) {
      if (page !== "" && page !== "index.html" && page !== "signup.html") {
        window.location.href = "index.html";
      }
    } else {
      // if already logged in and on auth page → send to home
      if (page === "" || page === "index.html" || page === "signup.html") {
        window.location.href = "home.html";
      }
      const emailEl = document.getElementById("currentUserEmail");
      if (emailEl) emailEl.textContent = user.email;
    }
  });
}

function setupLogout() {
  const btn = document.getElementById("logoutBtn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    await auth.signOut();
    window.location.href = "index.html";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupLogout();
  const googleBtn = document.getElementById("googleLoginBtn");
  if (googleBtn) {
    googleBtn.addEventListener("click", googleLogin);
  }
});
