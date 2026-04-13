const translations = {
  uk: {
    app_title: "Nexus",
    login_btn: "Увійти",
    logout_btn: "Вийти",
    hero_title: "Ласкаво просимо до Nexus",
    hero_subtitle: "Ексклюзивний контент, думки та медіа. Долучайся до нашої спільноти.",
    create_post_title: "Створити Пост",
    post_placeholder: "Що нового на Nexus?",
    publish_btn: "Опублікувати",
    loading: "Завантаження...",
    auth_login_title: "Вхід",
    auth_reg_title: "Реєстрація",
    email_placeholder: "Електронна пошта",
    pass_placeholder: "Пароль",
    nick_placeholder: "Нікнейм (тільки реєстрація)",
    submit_login: "Увійти",
    submit_reg: "Створити акаунт",
    switch_to_reg: "Або зареєструватися",
    switch_to_login: "Вже є акаунт?",
    no_posts: "Постів ще немає...",
    language: "Мова",
    like: "Лайк",
    comment: "Коментувати",
    share: "Поділитися",
    back: "Назад",
    copied: "Посилання скопійовано!",
    profile_btn: "Профіль",
    profile_title: "Мій Профіль",
    save_btn: "Зберегти",
    avatar_upload: "Завантажити Аватарку"
  },
  en: {
    app_title: "Nexus",
    login_btn: "Log In",
    logout_btn: "Log Out",
    hero_title: "Welcome to Nexus",
    hero_subtitle: "Exclusive content, thoughts, and media. Join our community.",
    create_post_title: "Create Post",
    post_placeholder: "What's new on Nexus?",
    publish_btn: "Publish",
    loading: "Loading...",
    auth_login_title: "Sign In",
    auth_reg_title: "Sign Up",
    email_placeholder: "Email address",
    pass_placeholder: "Password",
    nick_placeholder: "Nickname (Sign Up only)",
    submit_login: "Log In",
    submit_reg: "Create Account",
    switch_to_reg: "Or create an account",
    switch_to_login: "Already have an account?",
    no_posts: "No posts yet...",
    language: "Language",
    like: "Like",
    comment: "Comment",
    share: "Share",
    back: "Back",
    copied: "Link copied!",
    profile_btn: "Profile",
    profile_title: "My Profile",
    save_btn: "Save",
    avatar_upload: "Upload Avatar"
  }
};

let currentLang = localStorage.getItem('site_lang') || 'uk';

export function setLanguage(lang) {
  if (!translations[lang]) return;
  currentLang = lang;
  localStorage.setItem('site_lang', lang);
  updateDOM();
}

export function getLang() {
  return currentLang;
}

export function t(key) {
  return translations[currentLang][key] || key;
}

function updateDOM() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[currentLang][key]) {
      // Check if it's an input/textarea placeholder
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = translations[currentLang][key];
      } else {
        el.innerText = translations[currentLang][key];
      }
    }
  });
}

// Початкова ініціалізація
document.addEventListener('DOMContentLoaded', () => {
  updateDOM();
  const langSelect = document.getElementById('lang-select');
  if(langSelect) {
    langSelect.value = currentLang;
    langSelect.addEventListener('change', (e) => setLanguage(e.target.value));
  }
});