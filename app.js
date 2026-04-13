import { auth, db, storage } from "./firebase-config.js";
import { t } from "./i18n.js";
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, getDoc, updateDoc, deleteDoc, increment, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// Слухач стану (щоб знати роль та дані профілю при виведенні постів)
window.t = t;
window.currentUserRole = "guest";
window.currentUserName = "Користувач";
window.currentUserAvatar = "";

onAuthStateChanged(auth, async (user) => {
    if(user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if(userDoc.exists()) {
            const data = userDoc.data();
            window.t = t;
window.currentUserRole = data.role === 'admin' ? 'admin' : 'user';
            window.currentUserName = data.nickname || "Користувач";
            window.currentUserAvatar = data.avatarUrl || "";
        } else {
            window.t = t;
window.currentUserRole = 'user';
        }
    } else {
        window.t = t;
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
    const allMedia = data.media ? [...data.media] : [];
    // Fallback for old posts
    if (!data.media && data.mediaUrl) {
        allMedia.push({ url: data.mediaUrl, type: data.mediaType });
    }

    if (allMedia.length > 0) {
        mediaHtml += '<div style="margin-bottom: 15px; display:flex; flex-direction:column; gap:5px;">';
        allMedia.forEach(m => {
            let mHtml = '';
            const isNsfw = !!data.isNsfw;
            const extraStyle = isNsfw ? 'filter: blur(25px); transition: filter 0.3s;' : '';
            const clickHnd = isNsfw ? `onclick="window.handleNsfwMedia(this, '${id}')"` : '';
            const overlayIcon = isNsfw ? `<div class="nsfw-overlay" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); pointer-events:none; background:rgba(0,0,0,0.6); padding:5px 15px; border-radius:20px; color:#fff; font-weight:bold; font-size:14px;"><i class="ion-ios-eye-off"></i> 18+</div>` : '';

            if (m.type === 'image' || m.type.startsWith('image')) {
                mHtml = `<div style="position:relative; width: 100%;"><img src="${m.url}" class="post-media" alt="post info" style="${extraStyle}" ${clickHnd}>${overlayIcon}</div>`;
            } else if (m.type === 'video' || m.type.startsWith('video')) {
                // For videos, don't show controls initially if blurred to avoid weird UI behavior
                mHtml = `<div style="position:relative; width:100%;"><video src="${m.url}" style="width: 100%; border-radius: 12px; margin-bottom: 0; background: #000; ${extraStyle}" ${clickHnd} ${!isNsfw ? 'controls' : ''}></video>${overlayIcon}</div>`;
            } else if (m.type === 'audio' || m.type.startsWith('audio')) {
                mHtml = `<audio src="${m.url}" style="width:100%; margin-bottom:0;" controls></audio>`;
            }
            mediaHtml += mHtml;
        });
        mediaHtml += '</div>';
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
    let authorNameStr = data.authorName || 'Nexus';
    if(data.isAutoPost || data.authorName === "Nexus News Bot" || data.authorName === "Nexus Bot") {
        authorNameStr = t('ai_assistant') || 'Nexus AI';
    }
    const authorAvatarStr = data.authorAvatar ? `url('${data.authorAvatar}')` : 'linear-gradient(135deg, var(--primary-blue), #5ac8fa)';
    const profileLinkStyle = data.uid ? `cursor:pointer;" onclick="window.location.href='?user=${data.uid}'"` : '';

    postEl.innerHTML = `
        <div class="post-header">
            <div class="avatar" style="background-image: ${authorAvatarStr}; ${profileLinkStyle}"></div>
            <div class="author-name" style="${profileLinkStyle}">${authorNameStr}</div>
        </div>
        <div class="post-content" id="post-text-${id}" ${!isSingle ? `style="cursor:pointer;" onclick="window.location.href='?post=${id}'"` : ''}>${data.text || ''}</div>
        <div style="margin: 5px 0 10px; display: flex; justify-content: space-between; align-items: center; opacity: 0.8;">
            <span style="font-size: 11px; background: rgba(255,255,255,0.1); padding: 3px 8px; border-radius: 12px; font-weight: bold; color: var(--primary-color);">${data.category || 'FYP'}</span>
            <button onclick="translatePost('${id}')" style="background: none; border: none; font-size: 13px; color: var(--text-secondary); cursor: pointer;"><i class="ion-ios-globe"></i> Переклад</button>
        </div>
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
window.handleNsfwMedia = function(el, id) {
    if (!auth.currentUser) {
        sessionStorage.setItem('redirectAfterAuth', '?post=' + id);
        alert(t('nsfw_login'));
        document.getElementById('auth-modal').classList.remove('hidden');
        return;
    }
    
    if (confirm(t('nsfw_warning'))) {
        el.style.filter = 'none';
        el.removeAttribute('onclick'); // remove handler so it can be clicked normally (e.g. video play)
        
        // if video, add controls back
        if (el.tagName === 'VIDEO') {
            el.setAttribute('controls', 'true');
        }
        
        // Remove overlay label
        const overlay = el.parentElement.querySelector('.nsfw-overlay');
        if(overlay) overlay.style.display = 'none';
    }
};

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
    if (window.currentUserRole !== 'admin') { alert('Тільки адміністратор може це робити!'); return; }
    let count = prompt("Скільки лайків ти хочеш накрутити цьому посту?", "50");
    if (count && !isNaN(count)) {
        let num = Number(count);
        const currentLikes = parseInt(document.getElementById(`like-count-${id}`).innerText) || 0;
        document.getElementById(`like-count-${id}`).innerText = currentLikes + num;
        await updateDoc(doc(db, "posts", id), { likes: increment(num) });
    }
};

window.deletePost = async function(id) {
    if (window.currentUserRole !== 'admin') { alert('Тільки адміністратор може це робити!'); return; }
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
            if (userId === "bot_nexus") {
                if(userView) {
                    userView.classList.remove('hidden');
                    userView.innerHTML = `<div style="width: 100px; height: 100px; border-radius: 50%; background-image: url('ai%20bot%20foto.jpeg'); background-size: cover; background-position: center; margin: 0 auto 15px;"></div>
                        <h2 style="margin: 0; color: var(--text-color);">${t('ai_assistant') || 'AI помічник NEXUS'}</h2>
                        <p style="color: var(--text-secondary); margin-top: 10px; font-size: 15px; max-width: 400px; margin-left: auto; margin-right: auto; font-style: italic;">Цей користувач сховав свій профіль.</p>`;
                }
                postsContainer.innerHTML = '<div style="text-align: center; color: var(--text-secondary); margin-top:20px; font-style: italic;">Доступ закрито</div>';
                return;
            }

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
                if(window.autoTranslateAllPosts) window.autoTranslateAllPosts();
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
            
            window.allLoadedPosts = [];
            querySnapshot.forEach(docSnap => {
                let d = docSnap.data();
                d.id = docSnap.id;
                window.allLoadedPosts.push(d);
            });
            
            if (window.allLoadedPosts.length === 0) {
                 postsContainer.innerHTML = `<div style="text-align: center; margin-top: 50px; opacity: 0.5;">${t("no_posts")}</div>`;
                 return;
            }

            window.renderCachedPosts();
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
    if (window.currentUserRole !== 'admin') { alert('Тільки адміністратор може це робити!'); return; }
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

// --- Живий генератор постів ---
let generatorInterval = null;
const genBtn = document.getElementById('toggle-generator-btn');
const genLog = document.getElementById('generator-log');

const topics = [
    {text: "⚽️ Спорт: Мадридський Реал розгромив суперників у фіналі Ліги Чемпіонів. Емоції просто зашкалюють після вирішального голу на 89-й хвилині!", cat: "sport"},
    {text: "🏎 Формула 1: Макс Ферстаппен здобуває неймовірну перемогу на гран-прі Монако. Безумовний лідер!", cat: "sport"},
    {text: "🥊 Бокс: Олександр Усик вкотре підтверджує своє звання найкращого у світі, неймовірний бій!", cat: "sport"},
    {text: "🏀 Баскетбол: Фінал NBA перевершив усі очікування, боротьба до останньої секунди.", cat: "sport"},
    
    {text: "🌐 Новини: Ілон Маск заявив, що Neuralink успішно вживив новий чіп людині.", cat: "news"},
    {text: "🌍 Екологія: Глобальне потепління б'є рекорди. Вчені розробляють нові методи очищення океанів.", cat: "news"},
    {text: "🚀 Космос: NASA успішно запустила нову місію на Марс для пошуку слідів життя.", cat: "news"},
    
    {text: "📱 Технології: Apple представила нові окуляри змішаної реальності, які перевертають уявлення про роботу.", cat: "it"},
    {text: "💻 IT: Штучний інтелект замінює програмістів? Новий звіт показує шокуючі результати.", cat: "it"},
    {text: "🤖 AI: OpenAI випустила нову модель, яка вміє створювати фільми зі звичайного тексту.", cat: "it"},
    {text: "🔒 Кібербезпека: Велика корпорація знову зазнала хакерської атаки, мільйони даних злиті.", cat: "it"},
    
    {text: "🎮 Ігри: GTA 6 нарешті отримала офіційний трейлер. Графіка виглядає просто феноменально!", cat: "games"},
    {text: "👾 Кіберспорт: Українська команда NaVi перемогла на турнірі з CS2 і забрала головний приз.", cat: "games"},
    {text: "🕹 Релізи: Новий хіт в Steam побив рекорди онлайну за перші 24 години.", cat: "games"},
    
    {text: "🏛 Політика: Новий законопроект викликав бурхливі дискусії в парламенті. Які будуть наслідки?", cat: "politics"},
    {text: "⚖️ Вибори: Неочікувані результати екзит-полів змінюють політичний ландшафт країни.", cat: "politics"},
    {text: "🤝 Дипломатія: Важливий міжнародний саміт завершився підписанням історичної угоди.", cat: "politics"},
    
    {text: "📈 Тренди: Новий мем у TikTok збирає мільйони переглядів щодня. Усі намагаються повторити цей танець!", cat: "trends"},
    {text: "🔥 Соцмережі: Відомий блогер встановив новий світовий рекорд лайків на одному відео.", cat: "trends"},
    {text: "🎥 YouTube: Алгоритми знову змінилися, і контент-мейкери шукають нові формати.", cat: "trends"}
];

let generatorRunning = false;

if (genBtn) {
    genBtn.addEventListener('click', () => {
        if (!generatorRunning) {
            startGenerator();
            genBtn.innerText = "⏸ Зупинити Авто-Постер";
            genBtn.style.color = "#ff3b30";
            genLog.style.display = 'block';
        } else {
            stopGenerator();
            genBtn.innerText = "▶ Запустити Авто-Постер";
            genBtn.style.color = "var(--text-color)";
        }
    });
}

function startGenerator() {
    generatorRunning = true;
    logGenerator("🚀 Генератор запущено. Пости будуть публікуватися кожні 5 сек...");
    
    // Публікуємо перший відразу
    generatePost();
    
    generatorInterval = setInterval(() => {
        generatePost();
    }, 5000);
}

function stopGenerator() {
    generatorRunning = false;
    clearInterval(generatorInterval);
    logGenerator("🛑 Генератор зупинено.");
}

function logGenerator(msg) {
    if(!genLog) return;
    const time = new Date().toLocaleTimeString();
    genLog.innerHTML += `<div>[${time}] ${msg}</div>`;
    genLog.scrollTop = genLog.scrollHeight;
}

async function generatePost() {
    if(!auth.currentUser) {
        logGenerator("❌ Помилка: Ви не авторизовані!");
        stopGenerator();
        return;
    }
    
    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
    const randomText = randomTopic.text;
    const postCategory = randomTopic.cat;
    
    logGenerator(`📝 Готуємо пост: "${randomText.substring(0, 20)}..."`);
    
    try {
        const randomLikesCount = Math.floor(Math.random() * 99) + 2; // 2 to 100
        const botComments = [];
        
        const themeComments = {
            sport: [
                "Неймовірний результат! ⚽️", "Цей матч увійде в історію!", "Не очікував такого фіналу.", "Легендарна перемога 🏆", "Суддя був жахливий, але гра топ.",
                "Incredible match! ⚽️", "I can't believe this result!", "Legendary performance 🏆", "Game of the year!", "Unreal skills.",
                "Incroyable match! ⚽️", "Quelle finale!", "Victoire historique 🏆", "Fantastique!", "Le meilleur joueur!",
                "¡Increíble partido! ⚽️", "¡Qué final tan emocionante!", "Victoria histórica 🏆", "¡Fantástico!", "¡El mejor jugador!"
            ],
            news: [
                "Дуже важлива новина.", "Світ так швидко змінюється 🌍", "Куди ми котимось...", "Сподіваюсь, що все буде добре.", "Шокуюче!",
                "Very important news.", "The world is changing so fast 🌍", "Where are we heading...", "I hope everything will be fine.", "Shocking!",
                "Nouvelle très importante.", "Le monde change si vite 🌍", "Où allons-nous...", "J'espère que tout ira bien.", "Choquant !",
                "Noticia muy importante.", "El mundo cambia muy rápido 🌍", "¿Hacia dónde nos dirigimos...", "Espero que todo salga bien.", "¡Sorprendente!"
            ],
            it: [
                "Код стає писати легше 💻", "А як же конфіденційність?", "Я вже хочу протестувати цю нейромережу!", "Ці технології лякають.", "Майбутнє вже настало 🤖",
                "Coding is getting easier 💻", "What about privacy?", "I want to test this AI now!", "These tech trends are scary.", "The future is here 🤖",
                "Coder devient plus facile 💻", "Et la vie privée ?", "Je veux tester cette IA !", "Ces technologies font peur.", "Le futur est là 🤖",
                "Programar es más fácil 💻", "¿Qué pasa con la privacidad?", "¡Quiero probar esta IA!", "Estas tecnologías asustan.", "El futuro ya está aquí 🤖"
            ],
            games: [
                "Готую гроші на покупку 💸", "Графіка просто космос!", "Сподіваюсь, оптимізація теж буде ок.", "Це гра року, 100%.", "GTA 6 зламала інтернет 🎮",
                "Taking my money 💸", "Graphics are pure madness!", "Hope the optimization is fine.", "GOTY for sure.", "This broke the internet 🎮",
                "Prenez mon argent 💸", "Les graphismes sont fous !", "J'espère que l'optimisation est bonne.", "GOTY à 100%.", "Ça a cassé internet 🎮",
                "Toma mi dinero 💸", "¡Los gráficos son locos!", "Espero que la optimización sea buena.", "GOTY seguro.", "Rompió el internet 🎮"
            ],
            politics: [
                "Спірне рішення...", "Побачимо, до чого це призведе 🏛", "Економіка від цього тільки програє.", "Оце так поворот подій!", "Не вірю цим обіцянкам.",
                "Controversial decision...", "Let's see where this leads 🏛", "The economy will suffer.", "What a plot twist!", "I don't buy these promises.",
                "Décision controversée...", "Voyons où cela mène 🏛", "L'économie en souffrira.", "Quel rebondissement !", "Je ne crois pas ces promesses.",
                "Decisión controvertida...", "Veremos a dónde lleva esto 🏛", "La economía sufrirá.", "¡Qué giro de los acontecimientos!", "No creo en estas promesas."
            ],
            trends: [
                "Цей тренд усюди 🔥", "Вже трохи набридло, якщо чесно.", "Зробив таке ж відео і набрав 100к переглядів!", "Інтернет зійшов з розуму 📱", "Обожнюю це!",
                "This trend is everywhere 🔥", "Kinda tired of it, to be honest.", "Did the same and got 100k views!", "The internet is crazy 📱", "Love this!",
                "Cette tendance est partout 🔥", "Un peu fatigué de ça.", "J'ai fait une vidéo, 100k vues !", "Internet est fou 📱", "J'adore ça !",
                "Esta tendencia está en todas partes 🔥", "Un poco cansado de ello.", "¡Hice un video y 100k vistas!", "El internet está loco 📱", "¡Me encanta!"
            ]
        };
        
        const possibleComments = themeComments[postCategory] || themeComments['news'];
        const numComments = Math.floor(Math.random() * 99) + 2; // 2 to 100 comments
        for(let i=0; i<numComments; i++){
            botComments.push({
                uid: "botuser_" + Math.random().toString(36).substring(7),
                author: "Користувач_" + Math.floor(Math.random() * 1000),
                avatar: "",
                text: possibleComments[Math.floor(Math.random() * possibleComments.length)],
                likes: [],
                timestamp: new Date().toISOString()
            });
        }
        
        await addDoc(collection(db, "posts"), {
            text: randomText,
            category: postCategory,
            mediaUrl: null,
            mediaType: null,
            uid: "bot_nexus",
            authorName: "AI помічник NEXUS",
            isAutoPost: true,
            authorAvatar: "ai%20bot%20foto.jpeg",
            timestamp: serverTimestamp(),
            likes: randomLikesCount,
            comments: botComments
        });
        logGenerator('✅ Пост опубліковано успішно!');
        loadAppContent(); // Оновлюємо стрічку
    } catch(err) {
        logGenerator(`❌ Помилка: ${err.message}`);
    }
}



// --- TIKTOK FYP & CATEGORY SYSTEM ---
window.currentCategory = 'all';
let userLikesHistory;
try {
    userLikesHistory = JSON.parse(localStorage.getItem('user_likes_history') || '{"sport":0, "news":0, "it":0, "games":0}');
} catch(e) {
    userLikesHistory = {"sport":0, "news":0, "it":0, "games":0};
    localStorage.setItem('user_likes_history', JSON.stringify(userLikesHistory));
}

window.setCategory = function(cat, btnElement) {
    window.currentCategory = cat;
    document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.category-btn').forEach(btn => btn.style.background = 'rgba(255,255,255,0.1)');
    document.querySelectorAll('.category-btn').forEach(btn => btn.style.border = 'none');
    
    if(btnElement) {
        btnElement.classList.add('active');
        btnElement.style.background = 'var(--primary-color)';
    }
    window.renderCachedPosts();
};

document.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', (e) => window.setCategory(e.target.dataset.cat, e.target));
});

function recordLikeForAlgorithm(postData) {
    if(postData && postData.category) {
        userLikesHistory[postData.category] = (userLikesHistory[postData.category] || 0) + 1;
        localStorage.setItem('user_likes_history', JSON.stringify(userLikesHistory));
    }
}

// Hook into like
const originalHandleLike = window.handleLike;
window.handleLike = async function(id) {
    const post = window.allLoadedPosts?.find(p => p.id === id);
    if(post) recordLikeForAlgorithm(post);
    originalHandleLike(id);
};

// --- AUTOCOMPLETE FILTER ---
const searchInputEl = document.getElementById('search-input');
const autocompleteBox = document.getElementById('search-autocomplete');

if(searchInputEl && autocompleteBox) {
    searchInputEl.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('post') || urlParams.get('user')) {
             window.location.href = '/?search=' + encodeURIComponent(query);
             return;
        }
        if(!query) {
            autocompleteBox.style.display = 'none';
            window.renderCachedPosts();
            return;
        }
        
        const suggestions = (window.allLoadedPosts || []).filter(p => p.text.toLowerCase().includes(query)).slice(0, 5);
        
        if(suggestions.length > 0) {
            autocompleteBox.innerHTML = suggestions.map(s => 
                `<div style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer;" onclick="document.getElementById('search-input').value='\${s.text.replace(/'/g, "\'")}\'; document.getElementById('search-autocomplete').style.display='none'; window.renderCachedPosts();">${s.text.substring(0, 60)}...</div>`
            ).join('');
            autocompleteBox.style.display = 'block';
        } else {
            autocompleteBox.style.display = 'none';
        }
        
        window.renderCachedPosts();
    });

    document.addEventListener('click', (e) => {
        if(e.target !== searchInputEl && e.target !== autocompleteBox) {
            autocompleteBox.style.display = 'none';
        }
    });
}

// --- TRANSLATOR LOGIC ---
window.translatePost = function(postId) {
    const postTextEl = document.getElementById('post-text-' + postId);
    if(!postTextEl) return;
    
    const currentText = postTextEl.innerText;
    let targetLang = (window.currentLang);
    if(targetLang && targetLang.includes('-')) targetLang = targetLang.split('-')[0]; // from i18n if available
    if(!targetLang) targetLang = document.getElementById('lang-select') ? document.getElementById('lang-select').value : 'en';

    postTextEl.innerText = "⏳ Переклад... (Translating...)";

    const url = `https://api.mymemory.translated.net/get?q=\${encodeURIComponent(currentText)}\&langpair=uk|\${targetLang}`;
    
    fetch(url)
        .then(res => res.json())
        .then(data => {
            if(data && data.responseData && data.responseData.translatedText) {
                postTextEl.innerText = data.responseData.translatedText;
            } else {
                postTextEl.innerText = currentText; // fallback
                alert("Translation failed");
            }
        }).catch(err => {
            console.error(err);
            postTextEl.innerText = currentText;
        });
};


window.renderCachedPosts = function() {
    if(!window.allLoadedPosts) return;
    const postsContainer = document.getElementById('posts');
    if(!postsContainer) return;
    
    // FILTER BY SEARCH
    const searchEl = document.getElementById('search-input');
    const searchTerm = searchEl ? searchEl.value.toLowerCase().trim() : '';

    // FILTER BY CATEGORY
    let filtered = window.allLoadedPosts;
    if(window.currentCategory && window.currentCategory !== 'all') {
        filtered = filtered.filter(p => p.category === window.currentCategory);
    }
    if(searchTerm) {
        filtered = filtered.filter(p => (p.text || '').toLowerCase().includes(searchTerm) || (p.authorName || '').toLowerCase().includes(searchTerm));
    }

    // FYP SORT LOGIC
    if(window.currentCategory === 'all') {
        let history;
        try {
            history = JSON.parse(localStorage.getItem('user_likes_history') || '{"sport":0, "news":0, "it":0, "games":0}');
        } catch(e) {
            history = {"sport":0, "news":0, "it":0, "games":0};
        }
        filtered.sort((a, b) => {
            const aCatScore = history[a.category] || 0;
            const bCatScore = history[b.category] || 0;
            const aTime = a.timestamp?.seconds || 0;
            const bTime = b.timestamp?.seconds || 0;
            const aScore = aCatScore * 1000000 + aTime;
            const bScore = bCatScore * 1000000 + bTime;
            return bScore - aScore;
        });
    }

    postsContainer.innerHTML = '';
    if (filtered.length === 0) {
         postsContainer.innerHTML = `<div style="text-align: center; margin-top: 50px; opacity: 0.5;">${window.currentLang==='en'?'No results':(window.currentLang==='uk'?'Немає результатів':'No posts')}</div>`;
    } else {
         filtered.forEach((postData) => {
             postsContainer.appendChild(createPostElement(postData.id, postData, false));
         });
    }
    
    // Trigger auto-translation for non-UA users
    if(window.autoTranslateAllPosts) window.autoTranslateAllPosts();
};

window.renderCachedPosts();

// AUTOTRANSLATION LOGIC
window.autoTranslateAllPosts = async function() {
    let targetLang = (window.getLang ? window.getLang() : (window.currentLang || (document.getElementById('lang-select') ? document.getElementById('lang-select').value : 'uk')));
    if(targetLang && targetLang.includes('-')) targetLang = targetLang.split('-')[0];
    
    // We only auto-translate if the user's language is NOT Ukrainian, because the base dynamic posts are all in UA.
    if(targetLang === 'uk' || targetLang === 'ru') return;

    // Give it a tiny delay to not freeze the UI
    setTimeout(() => {
        const posts = document.querySelectorAll('.post-content');
        posts.forEach(el => {
            if(el.dataset.translated === "true") return;
            const currentText = el.innerText;
            if(!currentText || currentText.trim().length === 0) return;
            
            // Basic detection: if the text already contains common letters of the target language, or is short, we could skip it.
            // But let's just translate it if it's new.
            el.dataset.translated = "true";
            const originalHtml = el.innerHTML;
            
            fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(currentText)}&langpair=uk|${targetLang}`)
                .then(res => res.json())
                .then(data => {
                    if(data && data.responseData && data.responseData.translatedText) {
                        el.innerText = data.responseData.translatedText;
                        el.style.borderLeft = "2px solid var(--primary-color)";
                        el.style.paddingLeft = "8px";
                    }
                }).catch(err => {
                    console.error("Auto-translate error:", err);
                });
        });
    }, 500);
};
