import { auth, db, storage } from "./firebase-config.js";
import { t } from "./i18n.js";
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, getDoc, updateDoc, deleteDoc, increment, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// Слухач стану (щоб знати роль та дані профілю при виведенні постів)
window.currentUserRole = "guest";
window.currentUserName = "Користувач";
window.currentUserAvatar = "";

onAuthStateChanged(auth, async (user) => {
    if(user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if(userDoc.exists()) {
            const data = userDoc.data();
            window.currentUserRole = data.role === 'admin' ? 'admin' : 'user';
            window.currentUserName = data.nickname || "Користувач";
            window.currentUserAvatar = data.avatarUrl || "";
        } else {
            window.currentUserRole = 'user';
        }
    } else {
        window.currentUserRole = 'guest';
        window.currentUserName = "Користувач";
        window.currentUserAvatar = "";
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
            let type = file.type.split('/')[0]; 
            const fileRef = ref(storage, `posts/${Date.now()}_${file.name}`);
            
            // Використовуємо uploadBytesResumable для відображення відсотків
            const uploadTask = uploadBytesResumable(fileRef, file);
            
            // Налаштовуємо слухача прогресу (але не блокуємо ним потік)
            uploadTask.on('state_changed', (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                createPostBtn.innerText = `Завантаження медіа: ${Math.round(progress)}%`;
            });
            
            // Чекаємо завершення та ловимо помилки, якщо будуть
            try {
                await uploadTask;
                mediaUrl = await getDownloadURL(fileRef);
            } catch (err) {
                console.error("Upload error:", err);
                alert("Не вдалося завантажити медіа. Перевір інтернет-з'єднання або розмір файлу.");
                createPostBtn.innerText = "Створити пост";
                createPostBtn.disabled = false;
                return;
            }
            
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

    // Перевірка, чи лайкнув поточний юзер (якщо у даних поста є масив likedBy)
    const hasLiked = auth.currentUser && data.likedBy && data.likedBy.includes(auth.currentUser.uid);
    const heartIcon = hasLiked ? 'ion-ios-heart' : 'ion-ios-heart-outline';
    const heartStyle = hasLiked ? 'color: #ff3b30;' : '';

    // Блок коментарів
    const commentsList = (data.comments || []).map(c => `
        <div style="margin-top: 10px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 12px; font-size: 14px; display: flex; align-items: center; gap: 10px;">
            <div style="width: 25px; height: 25px; min-width: 25px; border-radius: 50%; background-image: ${c.avatar ? `url('${c.avatar}')` : 'linear-gradient(135deg, var(--primary-blue), #5ac8fa)'}; background-size: cover; background-position: center;"></div>
            <div style="line-height: 1.3;">
                <span style="font-weight: bold; color: var(--primary-blue);">${c.name}:</span>
                <span style="color: var(--text-color);">${c.text}</span>
            </div>
        </div>
    `).join('');

    const commentsSection = `
        <div id="comments-container-${id}" style="display: none; margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
            <div id="comments-list-${id}" style="max-height: 200px; overflow-y: auto; margin-bottom: 10px;">
                ${commentsList || '<div style="font-size:13px; color:var(--text-secondary); text-align:center; padding: 10px 0;">Ще немає коментарів. Напишіть щось!</div>'}
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
                <input type="text" id="comment-input-${id}" placeholder="${t('comment')}..." style="flex:1; padding: 10px 15px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: var(--text-color); outline: none;">
                <button class="action-btn" onclick="submitComment('${id}')" style="background: var(--primary-blue); border: none; padding: 8px 18px; border-radius: 20px; color: #fff; font-weight: bold; cursor: pointer;">
                    Відправити
                </button>
            </div>
        </div>
    `;

    const postEl = document.createElement('div');
    postEl.className = 'post';
    postEl.innerHTML = `
        <div class="post-header" ${!isSingle ? `style="cursor:pointer;" onclick="window.location.href='?post=${id}'"` : ''}>
            <div class="avatar" style="background-image: linear-gradient(135deg, var(--primary-blue), #5ac8fa)"></div>
            <div class="author-name">Nexus</div>
        </div>
        <div class="post-content" ${!isSingle ? `style="cursor:pointer;" onclick="window.location.href='?post=${id}'"` : ''}>${data.text || ''}</div>
        ${mediaHtml}
        <div class="post-actions" style="flex-wrap: wrap;">
            <button class="action-btn" id="like-btn-${id}" onclick="handleLike('${id}')" style="${heartStyle}">
                <i class="${heartIcon}"></i> <span id="like-count-${id}">${data.likes || 0}</span>
            </button>
            <button class="action-btn" onclick="handleComment('${id}')"><i class="ion-ios-chatbubble-outline"></i> <span id="comment-count-${id}">${(data.comments || []).length || t("comment")}</span></button>
            <button class="action-btn share-btn" data-id="${id}"><i class="ion-ios-upload-outline"></i> ${t("share")}</button>
            ${adminActions}
        </div>
        ${commentsSection}
    `;
    return postEl;
}

// === Глобальні функції для онкліків ===
window.handleLike = async function(id) {
    if (!auth.currentUser) {
        document.getElementById('auth-modal').classList.remove('hidden');
        return;
    }
    const uid = auth.currentUser.uid;
    const btn = document.getElementById(`like-btn-${id}`);
    const icon = btn.querySelector('i');
    const countSpan = document.getElementById(`like-count-${id}`);
    
    if (icon.classList.contains('ion-ios-heart')) {
        // Забираємо лайк
        icon.classList.replace('ion-ios-heart', 'ion-ios-heart-outline');
        btn.style.color = '';
        countSpan.innerText = Math.max(0, parseInt(countSpan.innerText) - 1);
        await updateDoc(doc(db, "posts", id), { 
            likes: increment(-1), 
            likedBy: arrayRemove(uid) 
        });
    } else {
        // Ставимо лайк
        icon.classList.replace('ion-ios-heart-outline', 'ion-ios-heart');
        btn.style.color = '#ff3b30'; // Червоне серденько
        countSpan.innerText = parseInt(countSpan.innerText || 0) + 1;
        await updateDoc(doc(db, "posts", id), { 
            likes: increment(1), 
            likedBy: arrayUnion(uid) 
        });
    }
};

window.handleComment = function(id) {
    if (!auth.currentUser) {
        document.getElementById('auth-modal').classList.remove('hidden');
        return;
    }
    // Відкриваємо/закриваємо секцію коментарів під постом
    const container = document.getElementById(`comments-container-${id}`);
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
};

window.submitComment = async function(id) {
    if (!auth.currentUser) return;
    const input = document.getElementById(`comment-input-${id}`);
    const text = input.value.trim();
    if (!text) return;
    
    input.disabled = true; // Блокуємо від спаму
    
    const newComment = {
        uid: auth.currentUser.uid,
        name: window.currentUserName || "Користувач",
        avatar: window.currentUserAvatar || "",
        text: text,
        timestamp: new Date().toISOString()
    };
    
    await updateDoc(doc(db, "posts", id), {
        comments: arrayUnion(newComment)
    });
    
    // Оновлюємо UI миттєво
    input.value = '';
    input.disabled = false;
    
    const list = document.getElementById(`comments-list-${id}`);
    const commentHtml = `
        <div style="margin-top: 10px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 12px; font-size: 14px; display: flex; align-items: center; gap: 10px;">
            <div style="width: 25px; height: 25px; min-width: 25px; border-radius: 50%; background-image: ${newComment.avatar ? `url('${newComment.avatar}')` : 'linear-gradient(135deg, var(--primary-blue), #5ac8fa)'}; background-size: cover; background-position: center;"></div>
            <div style="line-height: 1.3;">
                <span style="font-weight: bold; color: var(--primary-blue);">${newComment.name}:</span>
                <span style="color: var(--text-color);">${newComment.text}</span>
            </div>
        </div>
    `;
    
    if (list.innerHTML.includes("Ще немає коментарів")) {
        list.innerHTML = commentHtml;
    } else {
        list.insertAdjacentHTML('beforeend', commentHtml);
    }
    
    const countSpan = document.getElementById(`comment-count-${id}`);
    const currCount = parseInt(countSpan.innerText) || 0;
    countSpan.innerText = currCount + 1;
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
