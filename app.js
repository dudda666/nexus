import { auth, db, storage } from "./firebase-config.js";
import { t } from "./i18n.js";
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, getDoc, updateDoc, deleteDoc, increment, arrayUnion, arrayRemove, where, limit } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

window.currentCategory = 'all';

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
    loadAppContent(); // Перерендерити стрічку
    startAutoPoster(); // Запустити бота з новими правами
});

const createPostBtn = document.getElementById('create-post-btn');
const postText = document.getElementById('post-text');
const postMedia = document.getElementById('post-media');
const postsContainer = document.getElementById('posts');

createPostBtn.addEventListener('click', async () => {
    if (!auth.currentUser) return alert("Помилка авторизації");
    
    const text = postText.value;
    const files = postMedia.files;
    const isNsfw = document.getElementById('post-nsfw') ? document.getElementById('post-nsfw').checked : false;
    const categorySelect = document.getElementById('post-category');
    const categoryStr = categorySelect ? categorySelect.value : 'none';

    if (!text && files.length === 0) return;

    if (window.currentUserRole !== 'admin') {
        alert(t('error_not_admin') || "Only main admin can post");
        return;
    }

    createPostBtn.innerText = t("loading");
    createPostBtn.disabled = true;

    try {
        let uploadedMedia = [];
        if (files.length > 0) {
            const uploadPromises = Array.from(files).map((file, index) => {
                return new Promise((resolve, reject) => {
                    let type = file.type.split('/')[0]; 
                    
                    const xhr = new XMLHttpRequest();
                    xhr.open('POST', 'https://api.cloudinary.com/v1_1/dng0kwbln/auto/upload', true);
                    
                    xhr.upload.onprogress = (e) => {
                        if (e.lengthComputable && index === 0) {
                            const progress = (e.loaded / e.total) * 100;
                            createPostBtn.innerText = `Завантаження медіа: ${Math.round(progress)}%`;
                        }
                    };

                    xhr.onload = () => {
                        if (xhr.status === 200) {
                            const response = JSON.parse(xhr.responseText);
                            resolve({ url: response.secure_url, type: type });
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
            });
            createPostBtn.innerText = "Завантажуємо файли...";
            uploadedMedia = await Promise.all(uploadPromises);
        }

        await addDoc(collection(db, "posts"), {
            text: text,
            media: uploadedMedia,
            isNsfw: isNsfw,
            mediaUrl: uploadedMedia.length === 1 ? uploadedMedia[0].url : null,
            mediaType: uploadedMedia.length === 1 ? uploadedMedia[0].type : null,
            category: categoryStr !== 'none' ? categoryStr : null,
            uid: auth.currentUser.uid,
            authorName: window.currentUserName || "Nexus",
            authorAvatar: window.currentUserAvatar || "",
            timestamp: serverTimestamp(),
            likes: 0
        });
        postText.value = '';
        postMedia.value = '';
        if(document.getElementById('post-nsfw')) document.getElementById('post-nsfw').checked = false;
        loadAppContent(); 
    } catch(err) {
        console.error(err);
        alert("Помилка завантаження: " + err.message);
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
            const extraStyle = isNsfw ? 'filter: blur(25px); -webkit-filter: blur(25px); transition: filter 0.3s;' : '';
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
        <button class="action-btn" onclick="addFakeLikes('${id}')" style="color: var(--primary-blue); font-weight: bold;" data-i18n="admin_likes"><i class="ion-ios-flame"></i> ${t("admin_likes")}</button>
        <button class="action-btn" onclick="addFakeComments('${id}')" style="color: var(--primary-blue); font-weight: bold;" data-i18n="admin_comments"><i class="ion-ios-chatbubbles"></i> ${t("admin_comments")}</button>
        <button class="action-btn" onclick="deletePost('${id}')" style="color: red;" data-i18n="admin_delete"><i class="ion-ios-trash-outline"></i> ${t("admin_delete")}</button>
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
                <span class="comment-text" style="color: var(--text-color);">${c.text}</span>
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
    const fixedAvatar = data.authorAvatar ? data.authorAvatar.replace(/ /g, '%20') : '';
    const authorAvatarStr = fixedAvatar ? `url('${fixedAvatar}')` : 'linear-gradient(135deg, var(--primary-blue), #5ac8fa)';
    const profileLinkStyle = data.uid ? `cursor:pointer;" onclick="window.location.href='?user=${data.uid}'"` : '';

    postEl.innerHTML = `
        <div class="post-header">
            <div class="avatar" style="background-image: ${authorAvatarStr}; ${profileLinkStyle}"></div>
            <div class="author-name" style="${profileLinkStyle}">${authorNameStr}</div>
        </div>
        <div class="post-content" ${!isSingle ? `style="cursor:pointer;" onclick="window.location.href='?post=${id}'"` : ''}>${data.text || ''}</div>
        ${data.readMoreLink ? `<div style="margin-top: 10px; margin-bottom: 15px;"><a href="${data.readMoreLink}" target="_blank" style="padding: 8px 16px; background-color: var(--primary-blue); color: #fff; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: bold; display: inline-block;" data-i18n="read_more">${t("read_more")}</a></div>` : ''}
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
        el.style.webkitFilter = 'none';
        el.removeAttribute('onclick'); // remove handler so it can be clicked normally (e.g. video play)
        
        // Remove the overlay badge if it exists
        if (el.nextElementSibling && el.nextElementSibling.classList.contains('nsfw-overlay')) {
            el.nextElementSibling.remove();
        }
        
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
    if (window.currentUserRole !== 'admin') { alert('Тільки адміністратор може це робити!' /* not localized yet but it's admin only */); return; }
    let count = prompt("Скільки лайків ти хочеш накрутити цьому посту?", "50") /* admin stuff */;
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
                setTimeout(() => { if(window.autoTranslateAllPosts) window.autoTranslateAllPosts(); }, 200);

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
                setTimeout(() => { if(window.autoTranslateAllPosts) window.autoTranslateAllPosts(); }, 200);
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
                const docData = docSnap.data();
                if (window.currentCategory !== 'all' && docData.category !== window.currentCategory) return;
                postsContainer.appendChild(createPostElement(docSnap.id, docData, false));
            });
            setTimeout(() => { if(window.autoTranslateAllPosts) window.autoTranslateAllPosts(); }, 200);
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

// Ініціалізація пошуку (один раз)
const searchInput = document.getElementById('search-input');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const posts = document.querySelectorAll('.post');
        posts.forEach(post => {
            const textContent = post.querySelector('.post-content')?.innerText.toLowerCase() || '';
            const authorContent = post.querySelector('.author-name')?.innerText.toLowerCase() || '';
            if (textContent.includes(term) || authorContent.includes(term)) {
                post.style.display = 'block';
            } else {
                post.style.display = 'none';
            }
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
    const langInput = prompt("На яких мовах коментарі (ua, en)?", "ua, en") || "ua, en";
    const countStr = prompt("Скільки коментарів накрутити?", "3");
    const count = parseInt(countStr);
    if(isNaN(count) || count <= 0) return;

    const langsArray = langInput.split(',').map(s => s.trim().toLowerCase());

    const names = {
       "ua": ['Олександр', 'Марія', 'Дмитро', 'Юлія', 'Максим', 'Сонік', 'Анонім', 'Ірина', 'КіберКіт', 'Андрій', 'Олена'],
       "en": ['Alex', 'Mary', 'John', 'Sarah', 'Mike', 'Sonic', 'Anon', 'Emily', 'CyberCat', 'Chris', 'Jessica'],
       "Other": ['Leo', 'Anna', 'Bot', 'User']
    };
    
    // Гарячі та контекстні коментарі за категоріями
    const texts = {
       "ua": {
           "general": ['Супер! 🔥', 'Дуже круто!', 'Вау, не знав цього.', 'Повністю згоден!', 'Класний пост 👍', 'Цікава думка 🤔', 'Ахахах, жиза!', 'Дякую за інфу!', 'Круто!', 'Що за фігня?', 'Нічого собі!', 'Це дуже неочікувано 😮', 'Шок контент!', 'Оце так новина.', 'Бред якийсь...', 'Розрив мозку 🤯'],
           "sport": ['Неймовірний результат! ⚽️', 'Я так і знав!', 'Легендарно 🏆', 'Суддю на мило!', 'Це був крутий матч.'],
           "it": ['Ці технології розвиваються надто швидко 🤖', 'Код писати стає легше 💻', 'Штучний інтелект захопить світ!', 'Класний гаджет.'],
           "crypto": ['Біткоїн на місяць! 🚀', 'Треба докуповувати 💰', 'Що з курсом?', 'Кити щось мутять.', 'Час купувати чи продавати?'],
           "games": ['Оце графіка!', 'Коли реліз?', 'Я вже передзамовив 🎮', 'На ПК потягне?'],
           "politics": ['Це все політика...', 'Куди ми котимось?', 'Не вірю жодному слову.', 'Все буде добре 🇺🇦']
       },
       "en": {
           "general": ['Awesome! 🔥', 'Really cool!', 'Wow, did not know that.', 'Totally agree!', 'Great post 👍', 'Interesting thought 🤔', 'Hahaha, true!', 'Thanks for the info!', 'Cool!', 'Wtf is this?', 'No way!', 'So unexpected 😮', 'Shocking!', 'Crazy news.', 'Bullshit...', 'Mind blowing 🤯'],
           "sport": ['Incredible result! ⚽️', 'I knew it!', 'Legendary 🏆', 'What a match.'],
           "it": ['Tech is evolving too fast 🤖', 'AI will take over!', 'Cool gadget.'],
           "crypto": ['Bitcoin to the moon! 🚀', 'Buy the dip 💰', 'What is happening with the market?', 'Whales are playing.'],
           "games": ['Amazing graphics!', 'When is the release?', 'Already pre-ordered 🎮'],
           "politics": ['Just politics...', 'Where are we heading?', 'I do not believe it.']
       }
    };

    const postRef = doc(db, "posts", id);
    const postSnap = await getDoc(postRef);
    if(!postSnap.exists()) return;
    
    let postData = postSnap.data();
    let comments = postData.comments || [];
    let isVideo = postData.mediaType === 'video';
    let isPhoto = postData.mediaType === 'image';
    let cat = postData.category || 'general';
    
    for(let i=0; i<count; i++){
        let reqLang = langsArray[Math.floor(Math.random() * langsArray.length)];
        let l = reqLang;
        let needsTranslation = false;
        
        if (!texts[l]) {
            l = 'ua'; // base fallback for text pools
            needsTranslation = true;
        }
        
        let nDict = names[reqLang] || names[l] || names['Other'];
        let n = nDict[Math.floor(Math.random()*nDict.length)];
        
        let categoryPool = texts[l][cat] || texts[l]['general'];
        let pool = [...texts[l]['general'], ...categoryPool];
        
        if(isPhoto) {
            pool.push(l === 'ua' ? 'Класне фото 📸' : 'Nice pic 📸');
            pool.push(l === 'ua' ? 'Якість супер' : 'Great quality');
        }
        if(isVideo) {
            pool.push(l === 'ua' ? 'Круте відео 🎥' : 'Cool video 🎥');
            pool.push(l === 'ua' ? 'Залип на 5 хвилин' : 'Watched it 5 times');
        }
        
        let t = pool[Math.floor(Math.random()*pool.length)];
        
        if (needsTranslation && reqLang !== 'ua' && reqLang !== 'en') {
            try {
                // translate 't' into 'reqLang'
                const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${reqLang}&dt=t&q=${encodeURIComponent(t)}`);
                const dataTokens = await res.json();
                if (dataTokens && dataTokens[0]) {
                    let textResult = '';
                    dataTokens[0].forEach(item => { if (item[0]) textResult += item[0]; });
                    if (textResult) t = textResult;
                }
            } catch(e) { console.error("Translate error", e); }
        }
        
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
    
    const commentCountSpan = document.getElementById(`comment-count-${id}`);
    if(commentCountSpan) commentCountSpan.innerText = comments.length;
};

window.autoTranslateAllPosts = async function() {
    const langSelect = document.getElementById('lang-select');
    const targetLang = langSelect ? langSelect.value : 'uk';
    const elementsToTranslate = document.querySelectorAll('.post-content, .comment-text');
    elementsToTranslate.forEach(el => {
        const originalText = el.getAttribute('data-original-text') || el.innerText;
        if (!el.getAttribute('data-original-text')) {
            el.setAttribute('data-original-text', originalText);
        }
        
        // Skip empty strings
        if(!originalText.trim()) return;
        
        // Translate always
        fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(originalText)}`)
            .then(res => res.json())
            .then(data => {
                let translatedText = '';
                if (data && data[0]) {
                    data[0].forEach(item => {
                        if (item[0]) translatedText += item[0];
                    });
                }
                if (translatedText) {
                    el.innerText = translatedText;
                    if(el.classList.contains('post-content')) {
                        el.style.borderLeft = "2px solid var(--primary-color)";
                        el.style.paddingLeft = "8px";
                    }
                }
            }).catch(err => { console.error("Translate error", err); });
    });
};


window.currentCategory = window.currentCategory || 'all';
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.category-btn').forEach(b => {
                b.classList.remove('active');
                b.style.background = 'rgba(255,255,255,0.1)';
                b.style.color = 'var(--text-color)';
            });
            const clicked = e.currentTarget;
            clicked.classList.add('active');
            clicked.style.background = 'var(--primary-color)';
            clicked.style.color = 'white';
            window.currentCategory = clicked.getAttribute('data-cat');
            loadAppContent();
        });
    });
});




window._firebasePostFn = async function(text, category, compiledComments, extraData = {}) {
    const newPostData = {
        text: text,
        category: category,
        mediaUrl: null,
        mediaType: null,
        media: [],
        uid: "bot_nexus",
        authorName: "AI помічник NEXUS",
        isAutoPost: true,
        authorAvatar: "ai bot foto.jpeg",
        timestamp: serverTimestamp(), // note: might not be available immediately for createPostElement rendering, but fine
        likes: Math.floor(Math.random() * 200) + compiledComments.length + 5,
        comments: compiledComments,
        ...extraData
    };
    
    const docRef = await addDoc(collection(db, "posts"), newPostData);
    
    if (!window.location.search && (window.currentCategory === 'all' || window.currentCategory === category)) {
        const postsContainer = document.getElementById('posts');
        if(postsContainer && typeof createPostElement === 'function') {
            const newEl = createPostElement(docRef.id, newPostData, false);
            // Append at the beginning
            const firstPost = postsContainer.querySelector('.post');
            if(firstPost) {
                postsContainer.insertBefore(newEl, firstPost);
            } else {
                if(postsContainer.innerHTML.includes('text-align: center') && postsContainer.innerHTML.includes('opacity')) {
                    postsContainer.innerHTML = '';
                }
                postsContainer.appendChild(newEl);
            }
            setTimeout(() => { if(window.autoTranslateAllPosts) window.autoTranslateAllPosts(); }, 200);
        }
    }
};

// AUTO POSTER BOT
window.autoPosterEnabled = false;
window.generatorTimeout = null;

function logToGenerator(msg) {
    const logBox = document.getElementById('generator-log');
    if(logBox) {
        logBox.innerHTML += `<div>${new Date().toLocaleTimeString()} - ${msg}</div>`;
        logBox.scrollTop = logBox.scrollHeight;
    }
    console.log("Bot:", msg);
}

async function startAutoPoster() {
    if (window.autoPosterInitialized) return;
    window.autoPosterInitialized = true;
    
    const btn = document.getElementById('toggle-generator-btn');
    const logBox = document.getElementById('generator-log');
    
    // Перевіряємо збережений стан
    window.autoPosterEnabled = localStorage.getItem('autoPosterEnabled') === 'true';
    
    if(window.autoPosterEnabled && btn) {
        btn.innerHTML = `⏹ <span data-i18n="auto_poster_stop">${t("auto_poster_stop")}</span>`;
        btn.style.color = '#ff3b30';
        if(logBox) logBox.style.display = 'block';
        logToGenerator(t('log_auto_restore'));
        generateRandomPost();
    }
    
    if(btn) {
        btn.addEventListener('click', () => {
            window.autoPosterEnabled = !window.autoPosterEnabled;
            localStorage.setItem('autoPosterEnabled', window.autoPosterEnabled);
            
            if(window.autoPosterEnabled) {
                btn.innerHTML = `⏹ <span data-i18n="auto_poster_stop">${t("auto_poster_stop")}</span>`;
                btn.style.color = '#ff3b30';
                if(logBox) logBox.style.display = 'block';
                logToGenerator(t('log_auto_started'));
                generateRandomPost();
            } else {
                btn.innerHTML = `▶ <span data-i18n="auto_poster_start">${t("auto_poster_start")}</span>`;
                btn.style.color = 'var(--text-color)';
                logToGenerator(t('log_auto_stopped'));
                if(window.generatorTimeout) clearTimeout(window.generatorTimeout);
            }
        });
    }
}

async function generateRandomPost() {
    if(!window.autoPosterEnabled) return;
    
    // Джерела: Війни/Конфлікти, Політика, Спорт, Ігри, Світ, Технології
    const feedSources = [
        { cat: 'news', rss: 'https://news.google.com/rss/search?q=world+war+conflict+when:1d&hl=en-US&gl=US&ceid=US:en', name: 'Війни та конфлікти' },
        { cat: 'politics', rss: 'https://news.google.com/rss/search?q=global+politics+when:1d&hl=en-US&gl=US&ceid=US:en', name: 'Політика' },
        { cat: 'sport', rss: 'https://news.google.com/rss/search?q=sports+when:1d&hl=en-US&gl=US&ceid=US:en', name: 'Спорт' },
        { cat: 'news', rss: 'https://news.google.com/rss/search?q=world+news+when:1d&hl=en-US&gl=US&ceid=US:en', name: 'Світ' },
        { cat: 'it', rss: 'https://news.google.com/rss/search?q=technology+when:1d&hl=en-US&gl=US&ceid=US:en', name: 'Технології' },
        { cat: 'crypto', rss: 'https://news.google.com/rss/search?q=cryptocurrency+OR+bitcoin+when:1d&hl=en-US&gl=US&ceid=US:en', name: 'Криптовалюта' },
        { cat: 'games', rss: 'https://news.google.com/rss/search?q=gaming+when:1d&hl=en-US&gl=US&ceid=US:en', name: 'Ігри' },
        { cat: 'trends', rss: 'https://news.google.com/rss/search?q=trending+news+when:1d&hl=en-US&gl=US&ceid=US:en', name: 'Тренди' }
    ];
    
    const source = feedSources[Math.floor(Math.random() * feedSources.length)];
    logToGenerator(`${t('log_searching')} ${source.name}...`);
    
    let articleFound = false;
    let fallbackDelay = 10000;
    
    try {
        const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.rss)}`);
        const json = await response.json();
        
        if (json.status === 'ok' && json.items && json.items.length > 0) {
            let history = JSON.parse(localStorage.getItem('botPostedHistory') || '[]');
            
            const nowTime = Date.now();
            let article = null;
            
            for (let a of json.items) {
                const title = a.title.trim();
                if (history.includes(title)) continue;
                
                // Перевіряємо дату публікації (максимум "вчорашня" новина = до 36 годин)
                if (a.pubDate) {
                    let dateStr = a.pubDate.replace(/-/g, '/');
                    if (!dateStr.includes('Z') && !dateStr.includes('T')) dateStr += ' UTC'; // rss2json is usually UTC
                    const pubTime = new Date(dateStr).getTime();
                    const diffHours = (nowTime - pubTime) / (1000 * 60 * 60);
                    if (isNaN(diffHours) || diffHours > 36 || diffHours < -24) { 
                        // Якщо новина застара, додаємо в історію, щоб не обробляти знову
                        if (!history.includes(title)) {
                            history.push(title);
                            if(history.length > 500) history.splice(0, 200);
                            localStorage.setItem('botPostedHistory', JSON.stringify(history));
                        }
                        continue; 
                    }
                }
                
                // Перевіряємо у базі даних (Firebase) чи не дублюється пост з інших пристроїв
                try {
                    const qDupe = query(collection(db, "posts"), where("originalTitle", "==", title), limit(1));
                    const snapDupe = await getDocs(qDupe);
                    if (!snapDupe.empty) {
                        history.push(title);
                        if(history.length > 500) history.splice(0, 200);
                        localStorage.setItem('botPostedHistory', JSON.stringify(history));
                        continue;
                    }
                } catch(err) {
                    console.error("Firebase duplicate check error", err);
                }
                
                // Успішно знайшли нову свіжу статтю
                article = a;
                break;
            }
            
            if(article) {
                articleFound = true;
                let articleTitle = article.title.trim();
                // Clean up "- Publisher Name" from Google news titles
                if(source.rss.includes("google.com")) {
                    articleTitle = articleTitle.split('-').slice(0, -1).join('-').trim() || articleTitle;
                }
                
                logToGenerator(`${t('log_found')} "${articleTitle.substring(0, 20)}..."`);
                
                // Google Translate EN -> UA
                const tRes = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=uk&dt=t&q=${encodeURIComponent(articleTitle)}`);
                const tData = await tRes.json();
                let translatedText = '';
                if(tData && tData[0]) { tData[0].forEach(item => { if(item[0]) translatedText += item[0]; }); }
                else { translatedText = articleTitle; }
                
                let prefix = "📰:";
                if(source.name === 'Війни та конфлікти') prefix = "🪖 Конфлікти:";
                else if(source.cat === 'sport') prefix = "⚽️ Спорт:";
                else if(source.cat === 'it') prefix = "💻 IT:";
                else if(source.cat === 'crypto') prefix = "💰 Криптовалюта:";
                else if(source.cat === 'games') prefix = "🎮 Ігри:";
                else if(source.cat === 'politics') prefix = "🏛 Політика:";
                else if(source.cat === 'trends') prefix = "📈 Тренди:";
                else if(source.cat === 'news') prefix = "🌍 Світ:";
                
                let randomText = prefix + " " + translatedText;
                
                const themeComments = {
                    sport: ["Неймовірний результат! ⚽️", "Цей матч увійде в історію!", "Легендарно 🏆"],
                    news: ["Сподіваюсь, все буде добре.", "Світ швидко змінюється 🌍", "Жахливо, що відбувається.", "Не віриться...", "Що буде далі?"],
                    it: ["Ці технології розвиваються надто швидко 🤖", "Код писати стає легше 💻", "Супер!"],
                    crypto: ["Біткоїн на місяць! 🚀", "Цікаві новини для ринку...", "Треба докуповувати 💰", "Кити знову в грі!"],
                    games: ["Графіка просто космос!", "Це гра року 🎮"],
                    politics: ["Побачимо, до чого це призведе 🏛", "Політичні ігри завжди складні.", "Головне, щоб було стабільно."],
                    trends: ["Цей тренд усюди 🔥", "Вже трохи набридло.", "Обожнюю це!"]
                };
                
                const possibleComments = themeComments[source.cat] || themeComments['news'];
                const botComments = [];
                const numComments = Math.floor(Math.random() * 3) + 1; 
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
                
                let imageUrl = article.enclosure?.link || article.thumbnail || null;
                if (!imageUrl && article.description) {
                    const imgMatch = article.description.match(/<img[^>]+src="([^">]+)"/);
                    if (imgMatch) imageUrl = imgMatch[1];
                }
                
                const extraData = {
                    originalTitle: article.title.trim(),
                    readMoreLink: article.link || "",
                    likes: Math.floor(Math.random() * 150) + botComments.length + 10
                };
                if (imageUrl) {
                    extraData.media = [{ url: imageUrl, type: 'image' }];
                }
                
                await window._firebasePostFn(randomText, source.cat, botComments, extraData);
                
                history.push(article.title.trim());
                if(history.length > 500) history.splice(0, 200);
                localStorage.setItem('botPostedHistory', JSON.stringify(history));
                
                logToGenerator(t('log_published'));
            } else {
                logToGenerator(t('log_all_exist'));
            }
        }
    } catch(e) {
        logToGenerator(t('log_error'));
        fallbackDelay = 15000;
    }
    
    // Якщо знайшли статтю -> миттєво постимо наступну (1-2 сек затримка для краси логів та щоб браузер не завис)
    // Якщо немає -> чекаємо 10 сек і беремо іншу категорію
    const nextDelay = articleFound ? (Math.floor(Math.random() * 1500) + 1000) : fallbackDelay;
    
    window.generatorTimeout = setTimeout(generateRandomPost, nextDelay);
}

