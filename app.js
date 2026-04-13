import { auth, db, storage } from "./firebase-config.js";
import { t } from "./i18n.js";
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

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

    const postEl = document.createElement('div');
    postEl.className = 'post';
    postEl.innerHTML = `
        <div class="post-header" ${!isSingle ? `style="cursor:pointer;" onclick="window.location.href='?post=${id}'"` : ''}>
            <div class="avatar" style="background-image: linear-gradient(135deg, var(--primary-blue), #5ac8fa)"></div>
            <div class="author-name">Nexus <span style="color:var(--primary-blue); font-size:12px;">(Admin)</span></div>
        </div>
        <div class="post-content" ${!isSingle ? `style="cursor:pointer;" onclick="window.location.href='?post=${id}'"` : ''}>${data.text || ''}</div>
        ${mediaHtml}
        <div class="post-actions">
            <button class="action-btn"><i class="ion-ios-heart-outline"></i> ${data.likes || 0}</button>
            <button class="action-btn" ${!isSingle ? `onclick="window.location.href='?post=${id}'"` : ''}><i class="ion-ios-chatbubble-outline"></i> ${t("comment")}</button>
            <button class="action-btn share-btn" data-id="${id}"><i class="ion-ios-upload-outline"></i> ${t("share")}</button>
        </div>
    `;
    return postEl;
}

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
