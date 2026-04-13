import { auth, db, storage } from "./firebase-config.js";
import { t } from "./i18n.js";
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, getDoc, updateDoc, deleteDoc, increment } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// Слухач стану (щоб знати роль при виведенні постів)
window.currentUserRole = "guest";
onAuthStateChanged(auth, async (user) => {
    if(user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if(userDoc.exists() && userDoc.data().role === 'admin') {
            window.currentUserRole = 'admin';
        } else {
            window.currentUserRole = 'user';
        }
    } else {
        window.currentUserRole = 'guest';
    }
    loadAppContent(); // Перерендерити стрічку з новими правами
});

const createPostBtn = document.getElementById('create-post-btn');
const postText = document.getElementById('post-text');
const postMedia = document.getElementById('post-media');
const postsContainer = document.getElementById('posts');

createPostBtn.addEventListener('click', async () => {
    if (!auth.currentUser) return alert("Помилка авторизації");
    
    const text = postText.value;
    const file = postMedia.files[0];
    let mediaUrl = null;
    let mediaType = null;

    if (!text && !file) return;

    createPostBtn.innerText = t("loading");
    createPostBtn.disabled = true;

    try {
        if (file) {
            createPostBtn.innerText = "Завантажую медіа (будь ласка, зачекайте)...";
            let type = file.type.split('/')[0]; 
            const fileRef = ref(storage, `posts/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(fileRef, file);
            mediaUrl = await getDownloadURL(snapshot.ref);
            mediaType = type;
        }

        await addDoc(collection(db, "posts"), {
            text: text,
            mediaUrl: mediaUrl,
            mediaType: mediaType,
            uid: auth.currentUser.uid,
            timestamp: serverTimestamp(),
            likes: 0
        });
        postText.value = '';
        postMedia.value = '';
        loadAppContent(); 
    } catch(err) {
        console.error(err);
        alert("Помилка завантаження: " + err.message + "\n\nМожливо, ти ще не увімкнув Storage(Сховище) у Firebase!");
    } finally {
        createPostBtn.innerText = t("publish_btn");
        createPostBtn.disabled = false;
    }
});

function createPostElement(id, data, isSingle) {
    let mediaHtml = '';
    if(data.mediaUrl) {
        if(data.mediaType === 'image') mediaHtml = `<img src="${data.mediaUrl}" class="post-media" alt="post info">`;
        if(data.mediaType === 'video') mediaHtml = `<video src="${data.mediaUrl}" class="post-media" controls playsinline></video>`;
        if(data.mediaType === 'audio') mediaHtml = `<audio src="${data.mediaUrl}" style="width:100%; margin-bottom:15px;" controls></audio>`;
    }

    const isAdmin = (window.currentUserRole === 'admin');
    
    // Адмінські кнопки
    const adminActions = isAdmin ? `
        <button class="action-btn" onclick="addFakeLikes('${id}')" style="color: var(--primary-blue); font-weight: bold;"><i class="ion-ios-flame"></i> Накрутити</button>
        <button class="action-btn" onclick="deletePost('${id}')" style="color: red;"><i class="ion-ios-trash-outline"></i> Видалити</button>
    ` : '';

    const postEl = document.createElement('div');
    postEl.className = 'post';
    postEl.innerHTML = `
        <div class="post-header" ${!isSingle ? `style="cursor:pointer;" onclick="window.location.href='?post=${id}'"` : ''}>
            <div class="avatar" style="background-image: linear-gradient(135deg, var(--primary-blue), #5ac8fa)"></div>
            <div class="author-name">Nexus <span style="color:var(--primary-blue); font-size:12px;">(Admin)</span></div>
        </div>
        <div class="post-content" ${!isSingle ? `style="cursor:pointer;" onclick="window.location.href='?post=${id}'"` : ''}>${data.text || ''}</div>
        ${mediaHtml}
        <div class="post-actions" style="flex-wrap: wrap;">
            <button class="action-btn" onclick="handleLike('${id}')">
                <i class="ion-ios-heart-outline"></i> <span id="like-count-${id}">${data.likes || 0}</span>
            </button>
            <button class="action-btn" onclick="handleComment('${id}')"><i class="ion-ios-chatbubble-outline"></i> ${t("comment")}</button>
            <button class="action-btn share-btn" data-id="${id}"><i class="ion-ios-upload-outline"></i> ${t("share")}</button>
            ${adminActions}
        </div>
    `;
    return postEl;
}

// === Глобальні функції для онкліків ===
window.handleLike = async function(id) {
    if (!auth.currentUser) {
        document.getElementById('auth-modal').classList.remove('hidden');
        return;
    }
    const currentLikes = parseInt(document.getElementById(`like-count-${id}`).innerText) || 0;
    document.getElementById(`like-count-${id}`).innerText = currentLikes + 1;
    await updateDoc(doc(db, "posts", id), { likes: increment(1) });
};

window.handleComment = function(id) {
    if (!auth.currentUser) {
        document.getElementById('auth-modal').classList.remove('hidden');
        return;
    }
    alert("Коментарі будуть додані в наступному оновленні! Але ти вже можеш лайкати.");
};

window.addFakeLikes = async function(id) {
    let count = prompt("Скільки лайків ти хочеш накрутити цьому посту?", "50");
    if (count && !isNaN(count)) {
        let num = Number(count);
        const currentLikes = parseInt(document.getElementById(`like-count-${id}`).innerText) || 0;
        document.getElementById(`like-count-${id}`).innerText = currentLikes + num;
        await updateDoc(doc(db, "posts", id), { likes: increment(num) });
    }
};

window.deletePost = async function(id) {
    if (confirm("Ти впевнений, що хочеш видалити цей пост назавжди?")) {
        await deleteDoc(doc(db, "posts", id));
        loadAppContent(); // Оновити стрічку
    }
};

async function loadAppContent() {
    postsContainer.innerHTML = '';
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('post');

    if (postId) {
        // РЕЖИМ: ОДИН ПОСТ
        const hero = document.querySelector('.hero-section');
        const adminPnl = document.getElementById('admin-panel');
        if(hero) hero.style.display = 'none';
        if(adminPnl) adminPnl.style.display = 'none';

        const backBtn = document.createElement('button');
        backBtn.style.marginBottom = '20px';
        backBtn.innerHTML = `<i class="ion-ios-arrow-back"></i> ${t("back")}`;
        backBtn.onclick = () => { window.location.href = window.location.pathname; };
        postsContainer.appendChild(backBtn);

        try {
            const docRef = doc(db, "posts", postId);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                postsContainer.appendChild(createPostElement(docSnap.id, docSnap.data(), true));
            } else {
                postsContainer.innerHTML += `<div style="text-align: center; margin-top: 50px; opacity: 0.5;">Post Not Found</div>`;
            }
        } catch(e) {
            console.error(e);
            postsContainer.innerHTML += `<div style="text-align: center; margin-top: 50px; color: red;">Error</div>`;
        }

    } else {
        // РЕЖИМ: СТРІЧКА
        const hero = document.querySelector('.hero-section');
        if(hero) hero.style.display = 'block';

        try {
            const q = query(collection(db, "posts"), orderBy("timestamp", "desc"));
            const querySnapshot = await getDocs(q);
            
            if (querySnapshot.empty) {
                 postsContainer.innerHTML = `<div style="text-align: center; margin-top: 50px; opacity: 0.5;">${t("no_posts")}</div>`;
                 return;
            }

            querySnapshot.forEach((docSnap) => {
                postsContainer.appendChild(createPostElement(docSnap.id, docSnap.data(), false));
            });
        } catch(e) {
            postsContainer.innerHTML = '<div style="text-align: center; margin-top: 50px; opacity: 0.5; color: red;">Error loading posts</div>';
            console.error(e);
        }
    }

    // Слухачі на кнопки "Поділитися"
    document.querySelectorAll('.share-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const url = window.location.origin + window.location.pathname + '?post=' + id;
            navigator.clipboard.writeText(url).then(() => {
                showToast(t("copied"));
            });
        });
    });
}

function showToast(msg) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

// Завантаження при відкритті та при зміні мови підтягуємо переклади
window.onload = loadAppContent;
document.getElementById('lang-select').addEventListener('change', () => loadAppContent());
