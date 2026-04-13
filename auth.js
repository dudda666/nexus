import { auth, db, storage } from "./firebase-config.js";
import { t, getLang } from "./i18n.js";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

const authBtn = document.getElementById('auth-btn');
const logoutBtn = document.getElementById('logout-btn');
const profileBtn = document.getElementById('profile-btn');
const authModal = document.getElementById('auth-modal');
const closeBtn = document.getElementById('close-modal');
const switchBtn = document.getElementById('auth-switch');
const submitBtn = document.getElementById('auth-submit');
const adminPanel = document.getElementById('admin-panel');

// Profile Elements
const profileModal = document.getElementById('profile-modal');
const closeProfileBtn = document.getElementById('close-profile-modal');
const profileNick = document.getElementById('profile-nick');
const profileBio = document.getElementById('profile-bio');
const profileAvatarInput = document.getElementById('profile-avatar-input');
const profileAvatarPreview = document.getElementById('profile-avatar-preview');
const profileSaveBtn = document.getElementById('profile-save-btn');

const authTitle = document.getElementById('auth-title');
const emailInput = document.getElementById('auth-email');
const passInput = document.getElementById('auth-password');
const nickInput = document.getElementById('auth-nick');

let isLoginMode = true;
let currentUserData = null; // Зберігаємо дані юзера
let newAvatarFile = null;

// Аутентифікація UI
authBtn.addEventListener('click', () => authModal.classList.remove('hidden'));
closeBtn.addEventListener('click', () => authModal.classList.add('hidden'));

// Профіль UI
profileBtn.addEventListener('click', async () => {
    profileModal.classList.remove('hidden');
    if (currentUserData) {
        profileNick.value = currentUserData.nickname || "";
        profileBio.value = currentUserData.bio || "";
        if (currentUserData.avatarUrl) {
            profileAvatarPreview.style.backgroundImage = `url(${currentUserData.avatarUrl})`;
            profileAvatarPreview.innerHTML = "";
            profileAvatarPreview.style.backgroundSize = "cover";
            profileAvatarPreview.style.backgroundPosition = "center";
        } else {
            profileAvatarPreview.innerHTML = (currentUserData.nickname || "?").charAt(0).toUpperCase();
        }
    }
});

closeProfileBtn.addEventListener('click', () => profileModal.classList.add('hidden'));

// Зміна аватарки
profileAvatarInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        newAvatarFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            profileAvatarPreview.style.backgroundImage = `url(${e.target.result})`;
            profileAvatarPreview.innerHTML = "";
            profileAvatarPreview.style.backgroundSize = "cover";
            profileAvatarPreview.style.backgroundPosition = "center";
        };
        reader.readAsDataURL(file);
    }
});

// Збереження профілю
profileSaveBtn.addEventListener('click', async () => {
    if (!auth.currentUser) return;
    
    profileSaveBtn.disabled = true;
    profileSaveBtn.innerText = t("loading");

    try {
        let avatarUrl = currentUserData?.avatarUrl || "";

        // Якщо вибрано новий файл (аватарка)
        if (newAvatarFile) {
            const formData = new FormData();
            formData.append('file', newAvatarFile);
            formData.append('upload_preset', 'nexus_post');

            const res = await fetch('https://api.cloudinary.com/v1_1/dng0kwbln/image/upload', {
                method: 'POST',
                body: formData
            });

            if (!res.ok) throw new Error("Помилка завантаження аватарки на Cloudinary");
            const data = await res.json();
            avatarUrl = data.secure_url;
        }

        // Оновлюємо в Firestore
        const userRef = doc(db, "users", auth.currentUser.uid);
        await updateDoc(userRef, {
            nickname: profileNick.value,
            bio: profileBio.value,
            avatarUrl: avatarUrl
        });

        // Оновлюємо локальну змінну
        currentUserData.nickname = profileNick.value;
        currentUserData.bio = profileBio.value;
        currentUserData.avatarUrl = avatarUrl;
        
        profileModal.classList.add('hidden');
        newAvatarFile = null;
        alert("Профіль оновлено!");
        window.location.reload(); // Оновлюємо щоб підтягнулись зміни в стрічці
    } catch (e) {
        console.error(e);
        alert("Помилка збереження.");
    } finally {
        profileSaveBtn.disabled = false;
        profileSaveBtn.innerText = t("save_btn");
    }
});

switchBtn.addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    authTitle.innerText = isLoginMode ? t('auth_login_title') : t('auth_reg_title');
    submitBtn.innerText = isLoginMode ? t('submit_login') : t('submit_reg');
    switchBtn.innerText = isLoginMode ? t('switch_to_reg') : t('switch_to_login');
    if(isLoginMode) nickInput.classList.add('hidden');
    else nickInput.classList.remove('hidden');
});

submitBtn.addEventListener('click', async () => {
    const email = emailInput.value;
    const password = passInput.value;
    const nickname = nickInput.value || "Anonymous";

    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            const userCreds = await createUserWithEmailAndPassword(auth, email, password);
            await setDoc(doc(db, "users", userCreds.user.uid), {
                nickname: nickname,
                role: 'user', 
                avatarUrl: ''
            });
        }
        authModal.classList.add('hidden');
    } catch (error) {
        alert(error.message);
    }
});

const googleBtn = document.getElementById('auth-google-btn');
if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            // Check if user already exists
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (!userDoc.exists()) {
                await setDoc(doc(db, "users", user.uid), {
                    nickname: user.displayName || "Google User",
                    role: "user",
                    avatarUrl: user.photoURL || ""
                });
            }
            authModal.classList.add('hidden');
        } catch (error) {
            console.error(error);
            alert("Помилка авторизації Google: " + error.message);
        }
    });
}

logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
    if (user) {
        authBtn.classList.add('hidden');
        profileBtn.classList.remove('hidden');
        logoutBtn.classList.remove('hidden');
        
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if(userDoc.exists()) {
                currentUserData = userDoc.data();
                if(currentUserData.role === 'admin') {
                    if(adminPanel) adminPanel.classList.remove('hidden');
                } else {
                    if(adminPanel) adminPanel.classList.add('hidden');
                }
            } else {
                // Відновлення, якщо документа юзера немає, але він зареєстрований
                await setDoc(doc(db, "users", user.uid), {
                    nickname: "Guest",
                    role: "user",
                    avatarUrl: ""
                });
                currentUserData = { nickname: "Guest", role: "user", avatarUrl: "" };
                if(adminPanel) adminPanel.classList.add('hidden');
            }
        } catch(e) {
             console.log("No access to user collection or error", e);
        }
        
        // Redirect if came from an NSFW wall or shared link
        const redirectStr = sessionStorage.getItem('redirectAfterAuth');
        if (redirectStr) {
            sessionStorage.removeItem('redirectAfterAuth');
            window.location.href = redirectStr;
        }
    } else {
        authBtn.classList.remove('hidden');
        profileBtn.classList.add('hidden');
        logoutBtn.classList.add('hidden');
        if(adminPanel) adminPanel.classList.add('hidden');
        currentUserData = null;
    }
});


const profileLogoutBtn = document.getElementById('profile-logout-btn');
if (profileLogoutBtn) {
    profileLogoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            profileModal.classList.add('hidden');
            window.location.reload();
        } catch (error) {
            alert(error.message);
        }
    });
}
