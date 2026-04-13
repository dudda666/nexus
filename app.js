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

    if (window.currentUserRole !== 'admin') {
        alert("Тільки головний адміністратор може публікувати пости!");
        return;
    }

    createPostBtn.innerText = t("loading");
    createPostBtn.disabled = true;

    try {
        if (file) {
            let type = file.type.split('/')[0]; 
            
            await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                // Використовуємо auto щоб Cloudinary сам визначив відео/фото чи аудіо
                xhr.open('POST', 'https://api.cloudinary.com/v1_1/dng0kwbln/auto/upload', true);
                
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const progress = (e.loaded / e.total) * 100;
                        createPostBtn.innerText = `Завантаження медіа: ${Math.round(progress)}%`;
                    }
                };

                xhr.onload = () => {
                    if (xhr.status === 200) {
                        const response = JSON.parse(xhr.responseText);
                        mediaUrl = response.secure_url;
                        resolve();
                    } else {
                        console.error("Cloudinary Error:", xhr.responseText);
                        reject(new Error("Помилка завантаження на сервер Cloudinary"));
                    }
                };

                xhr.onerror = () => {
                    reject(new Error("Помилка мережі (інтернету) під час завантаження"));
                };

                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', 'nexus_post');

                xhr.send(formData);
            });
            mediaType = type;
        }

        await addDoc(collection(db, "posts"), {
            text: text,
            mediaUrl: mediaUrl,
            mediaType: mediaType,
            uid: auth.currentUser.uid,
            authorName: window.currentUserName || "Nexus",
            authorAvatar: window.currentUserAvatar || "",
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
        <button class="action-btn" onclick="addFakeLikes('${id}')" style="color: var(--primary-blue); font-weight: bold;"><i class="ion-ios-flame"></i> Лайки</button>
        <button class="action-btn" onclick="addFakeComments('${id}')" style="color: var(--primary-blue); font-weight: bold;"><i class="ion-ios-chatbubbles"></i> Коменти</button>
        <button class="action-btn" onclick="deletePost('${id}')" style="color: red;"><i class="ion-ios-trash-outline"></i> Видалити</button>
    ` : '';

    // Перевірка, чи лайкнув поточний юзер (якщо у даних поста є масив likedBy)
    const hasLiked = auth.currentUser && data.likedBy && data.likedBy.includes(auth.currentUser.uid);
    const heartIcon = hasLiked ? 'ion-ios-heart' : 'ion-ios-heart-outline';
    const heartStyle = hasLiked ? 'color: #ff3b30;' : '';

    // Блок коментарів
    const commentsList = (data.comments || []).map(c => {
        const cLikes = c.likes || [];
        const hasLikedC = auth.currentUser && cLikes.includes(auth.currentUser.uid);
        const cHeartIcon = hasLikedC ? 'ion-ios-heart' : 'ion-ios-heart-outline';
        const cHeartColor = hasLikedC ? 'color: #ff3b30;' : 'color: var(--text-secondary);';
        
        return `
        <div style="margin-top: 10px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 12px; font-size: 14px; display: flex; align-items: flex-start; gap: 10px;">
            <div onclick="window.location.href='?user=${c.uid}'" style="cursor:pointer; width: 30px; height: 30px; min-width: 30px; border-radius: 50%; background-image: ${c.avatar ? `url('${c.avatar}')` : 'linear-gradient(135deg, var(--primary-blue), #5ac8fa)'}; background-size: cover; background-position: center;"></div>
            <div style="line-height: 1.3; flex: 1;">
                <span onclick="window.location.href='?user=${c.uid}'" style="font-weight: bold; color: var(--primary-blue); cursor:pointer;">${c.name}:</span>
                <span style="color: var(--text-color);">${c.text}</span>
            </div>
            <div style="min-width: 30px; text-align: right; cursor:pointer;" onclick="likeComment('${id}', '${c.id}')">
                <i class="${cHeartIcon}" style="${cHeartColor} font-size: 16px;"></i>
                <span style="font-size: 12px; color: var(--text-secondary);">${cLikes.length > 0 ? cLikes.length : ''}</span>
            </div>
        </div>
        `;
    }).join('');

    const commentsSection = `
        <div id="comments-container-${id}" style="display: none; margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
            <div id="comments-list-${id}" style="max-height: 250px; overflow-y: auto; margin-bottom: 10px; padding-right: 5px;">
                ${commentsList || '<div style="font-size:13px; color:var(--text-secondary); text-align:center; padding: 10px 0;">Ще немає коментарів. Напишіть щось!</div>'}
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
                <input type="text" id="comment-input-${id}" placeholder="${t('comment')}..." style="flex:1; padding: 10px 15px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: var(--text-color); outline: none;">
                <button class="action-btn" onclick="submitComment('${id}')" style="background: var(--primary-blue); border: none; padding: 8px 18px; border-radius: 20px; color: #fff; font-weight: bold; cursor: pointer;">
                    <i class="ion-ios-send"></i>
                </button>
            </div>
        </div>
    `;

    const postEl = document.createElement('div');
    postEl.className = 'post';
    const authorNameStr = data.authorName || 'Nexus';
    const authorAvatarStr = data.authorAvatar ? `url('${data.authorAvatar}')` : 'linear-gradient(135deg, var(--primary-blue), #5ac8fa)';
    const profileLinkStyle = data.uid ? `cursor:pointer;" onclick="window.location.href='?user=${data.uid}'"` : '';

    postEl.innerHTML = `
        <div class="post-header">
            <div class="avatar" style="background-image: ${authorAvatarStr}; ${profileLinkStyle}"></div>
            <div class="author-name" style="${profileLinkStyle}">${authorNameStr}</div>
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
        id: Date.now().toString() + Math.random().toString(36).substr(2,5),
        uid: auth.currentUser.uid,
        name: window.currentUserName || "Користувач",
        avatar: window.currentUserAvatar || "",
        text: text,
        likes: [],
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
    <div style="margin-top: 10px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 12px; font-size: 14px; display: flex; align-items: flex-start; gap: 10px;">
        <div onclick="window.location.href='?user=${newComment.uid}'" style="cursor:pointer; width: 30px; height: 30px; min-width: 30px; border-radius: 50%; background-image: ${newComment.avatar ? `url('${newComment.avatar}')` : 'linear-gradient(135deg, var(--primary-blue), #5ac8fa)'}; background-size: cover; background-position: center;"></div>
        <div style="line-height: 1.3; flex: 1;">
            <span onclick="window.location.href='?user=${newComment.uid}'" style="font-weight: bold; color: var(--primary-blue); cursor:pointer;">${newComment.name}:</span>
            <span style="color: var(--text-color);">${newComment.text}</span>
        </div>
        <div style="min-width: 30px; text-align: right; cursor:pointer;" onclick="likeComment('${id}', '${newComment.id}')">
            <i class="ion-ios-heart-outline" style="color: var(--text-secondary); font-size: 16px;"></i>
            <span style="font-size: 12px; color: var(--text-secondary);"></span>
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
    const userId = urlParams.get('user');

    const hero = document.querySelector('.hero-section');
    const adminPnl = document.getElementById('admin-panel');
    const navBar = document.getElementById('navigation-bar');
    const userView = document.getElementById('user-profile-view');

    // Якщо це перегляд одного поста або профілю - приховуємо головні панелі та показуємо "Назад"
    if (postId || userId) {
        if(hero) hero.style.display = 'none';
        if(adminPnl) adminPnl.style.display = 'none';
        if(navBar) navBar.style.display = 'flex';
    } else {
        if(hero) hero.style.display = 'block';
        if(navBar) navBar.style.display = 'none';
        if(userView) userView.classList.add('hidden');
    }

    if (userId) {
        // РЕЖИМ: ПРОФІЛЬ ЮЗЕРА
        try {
            const userDoc = await getDoc(doc(db, "users", userId));
            if (userDoc.exists()) {
                const uData = userDoc.data();
                if(userView) {
                    userView.classList.remove('hidden');
                    userView.innerHTML = `
                        <div style="width: 100px; height: 100px; border-radius: 50%; background-image: ${uData.avatarUrl ? `url('${uData.avatarUrl}')` : 'linear-gradient(135deg, var(--primary-blue), #5ac8fa)'}; background-size: cover; background-position: center; margin: 0 auto 15px;"></div>
                        <h2 style="margin: 0; color: var(--text-color);">${uData.nickname || 'Користувач'}</h2>
                        <p style="color: var(--text-secondary); margin-top: 10px; font-size: 15px; max-width: 400px; margin-left: auto; margin-right: auto;">${uData.bio || 'Цей користувач ще не додав опис профілю.'}</p>
                    `;
                }

                // Завантажуємо пости тільки цього юзера (Сортування поки що робимо на клієнті, щоб не потрібні були індекси Firebase)
                const q = query(collection(db, "posts"), orderBy("timestamp", "desc"));
                const querySnapshot = await getDocs(q);
                let userPostsCount = 0;
                querySnapshot.forEach((docSnap) => {
                    const postData = docSnap.data();
                    if(postData.uid === userId) {
                        userPostsCount++;
                        postsContainer.appendChild(createPostElement(docSnap.id, postData, false));
                    }
                });

                if (userPostsCount === 0) {
                    postsContainer.innerHTML = '<div style="text-align: center; color: var(--text-secondary); margin-top:20px;">Немає постів.</div>';
                }
            } else {
                if(userView) {
                    userView.classList.remove('hidden');
                    userView.innerHTML = '<h2 style="color: var(--text-color);">Користувача не знайдено</h2>';
                }
            }
        } catch (e) {
            console.error(e);
        }
        return;
    }

    if (postId) {
        // РЕЖИМ: ОДИН ПОСТ
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

window.likeComment = async function(postId, commentId) {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);
    if(postSnap.exists()){
        const postData = postSnap.data();
        let comments = postData.comments || [];
        let cIndex = comments.findIndex(c => c.id === commentId);
        if(cIndex > -1){
            let c = comments[cIndex];
            if(!c.likes) c.likes = [];
            let uIndex = c.likes.indexOf(uid);
            if(uIndex > -1){
                c.likes.splice(uIndex, 1); // Забрати лайк
            } else {
                c.likes.push(uid); // Поставити лайк
            }
            await updateDoc(postRef, { comments: comments });
            loadAppContent(); // Оновлюємо стрічку
        }
    }
};

window.addFakeComments = async function(id) {
    const lang = prompt("На якій мові коментарі (ua / en)?", "ua") || "ua";
    const countStr = prompt("Скільки коментарів накрутити?", "3");
    const count = parseInt(countStr);
    if(isNaN(count) || count <= 0) return;

    const names = {
       "ua": ['Олександр', 'Марія', 'Дмитро', 'Юлія', 'Максим', 'Сонік', 'Анонім', 'Ірина', 'КіберКіт', 'Андрій', 'Олена'],
       "en": ['Alex', 'Mary', 'John', 'Sarah', 'Mike', 'Sonic', 'Anon', 'Emily', 'CyberCat', 'Chris', 'Jessica']
    };
    const texts = {
       "ua": ['Супер! 🔥', 'Дуже круто!', 'Вау, не знав цього.', 'Повністю згоден!', 'Класний пост 👍', 'Цікава думка 🤔', 'Ахахах, жиза!', 'Відмінно!', 'Дякую за інфу!', 'Це просто топ!'],
       "en": ['Awesome! 🔥', 'Really cool!', 'Wow, did not know that.', 'Totally agree!', 'Great post 👍', 'Interesting thought 🤔', 'Hahaha, true!', 'Excellent!', 'Thanks for info!', 'This is top!']
    };

    const postRef = doc(db, "posts", id);
    const postSnap = await getDoc(postRef);
    if(!postSnap.exists()) return;
    
    let comments = postSnap.data().comments || [];
    let isVideo = postSnap.data().mediaType === 'video';
    let isPhoto = postSnap.data().mediaType === 'image';
    
    for(let i=0; i<count; i++){
        let l = lang.toLowerCase().includes('en') ? 'en' : 'ua';
        let n = names[l][Math.floor(Math.random()*names[l].length)];
        
        let pool = [...texts[l]];
        // Додаємо контекстні коментарі
        if(isPhoto) {
            pool.push(l === 'ua' ? 'Класне фото 📸' : 'Nice pic 📸');
            pool.push(l === 'ua' ? 'Якість супер' : 'Great quality');
        }
        if(isVideo) {
            pool.push(l === 'ua' ? 'Круте відео 🎥' : 'Cool video 🎥');
            pool.push(l === 'ua' ? 'Залип на 5 хвилин' : 'Watched it 5 times');
        }
        
        let t = pool[Math.floor(Math.random()*pool.length)];
        comments.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2,5),
            uid: 'fake_' + Math.random().toString(36).substr(2,9),
            name: n + (Math.random() > 0.5 ? Math.floor(Math.random()*99) : ''),
            avatar: '',
            text: t,
            likes: (Math.random() > 0.7 ? ['fake_like_1', 'fake_like_2'] : []),
            timestamp: new Date().toISOString()
        });
    }
    
    await updateDoc(postRef, { comments: comments });
    loadAppContent(); // Перерендерити
};
