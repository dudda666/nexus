import { auth, db, storage } from "./firebase-config.js";
import { t, getLang } from "./i18n.js";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged,
  signOut
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

        // Якщо вибрано новий файл
        if (newAvatarFile) {
            const avatarRef = ref(storage, `avatars/${auth.currentUser.uid}`);
            const sn = await uploadBytes(avatarRef, newAvatarFile);
            avatarUrl = await getDownloadURL(sn.ref);
        }

        // Оновлюємо в Firestore
        const userRef = doc(db, "users", auth.currentUser.uid);
        await updateDoc(userRef, {
            nickname: profileNick.value,
            avatarUrl: avatarUrl
        });

        // Оновлюємо локальну змінну
        currentUserData.nickname = profileNick.value;
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
                }
            } else {
                // Відновлення, якщо документа юзера немає, але він зареєстрований
                await setDoc(doc(db, "users", user.uid), {
                    nickname: "Guest",
                    role: "user",
                    avatarUrl: ""
                });
                currentUserData = { nickname: "Guest", role: "user", avatarUrl: "" };
            }
        } catch(e) {
             console.log("No access to user collection or error", e);
        }
    } else {
        authBtn.classList.remove('hidden');
        profileBtn.classList.add('hidden');
        logoutBtn.classList.add('hidden');
        if(adminPanel) adminPanel.classList.add('hidden');
        currentUserData = null;
    }
});
