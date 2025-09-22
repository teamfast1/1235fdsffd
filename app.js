// Мини-хостинг презентаций с Firebase и системой ролей
class PresentationHosting {
    constructor() {
        // Встроенная конфигурация Firebase
        this.firebaseConfig = {
            apiKey: "AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            authDomain: "your-project.firebaseapp.com", 
            projectId: "your-project-id",
            storageBucket: "your-project.appspot.com",
            messagingSenderId: "123456789",
            appId: "1:123456789:web:xxxxxxxxxxxxxxx"
        };
        
        this.currentUser = null;
        this.userRole = 'guest';
        this.currentPage = 'home';
        this.currentPresentation = null;
        this.pdfDoc = null;
        this.pageNum = 1;
        this.scale = 1.5;
        this.isFirebaseConnected = false;
        this.demoMode = true; // Сразу в демо-режиме
        this.isInitialized = false;
        
        // Демо данные для fallback режима
        this.demoData = {
            presentations: [
                {
                    id: 'demo1',
                    title: 'Введение в веб-разработку',
                    description: 'Основы создания современных веб-приложений с использованием HTML, CSS и JavaScript',
                    category: 'tech',
                    author: 'Демо пользователь',
                    ownerName: 'Демо пользователь',
                    createdAt: new Date('2024-01-15'),
                    isPublic: true,
                    viewCount: 142
                },
                {
                    id: 'demo2', 
                    title: 'Стратегии маркетинга',
                    description: 'Эффективные методы продвижения бизнеса в цифровую эпоху',
                    category: 'business',
                    author: 'Эксперт по маркетингу',
                    ownerName: 'Эксперт по маркетингу',
                    createdAt: new Date('2024-02-10'),
                    isPublic: true,
                    viewCount: 98
                },
                {
                    id: 'demo3',
                    title: 'Основы образовательных технологий',
                    description: 'Современные методы и инструменты в образовании',
                    category: 'education',
                    author: 'Преподаватель',
                    ownerName: 'Преподаватель',
                    createdAt: new Date('2024-03-05'),
                    isPublic: true,
                    viewCount: 76
                }
            ],
            users: [
                { id: 'demo-admin', email: 'admin@example.com', role: 'admin', displayName: 'Администратор', createdAt: new Date('2024-01-01') },
                { id: 'demo-user', email: 'user@example.com', role: 'user', displayName: 'Пользователь', createdAt: new Date('2024-01-15') }
            ]
        };
    }
    
    async init() {
        if (this.isInitialized) return;
        
        console.log('Инициализация приложения...');
        
        // Сначала устанавливаем демо-режим
        this.updateConnectionStatus('disconnected', 'Демо-режим');
        
        // Привязываем события
        this.bindEvents();
        
        // Показываем главную страницу
        this.showPage('home');
        
        // Загружаем презентации
        await this.loadPresentations();
        
        // Пробуем подключиться к Firebase в фоне
        this.tryFirebaseConnection();
        
        this.isInitialized = true;
        console.log('Приложение инициализировано');
    }
    
    async tryFirebaseConnection() {
        try {
            console.log('Попытка подключения к Firebase...');
            
            // Если Firebase уже инициализирован, пропускаем
            if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
                console.log('Firebase уже инициализирован');
                return;
            }
            
            firebase.initializeApp(this.firebaseConfig);
            this.db = firebase.firestore();
            this.auth = firebase.auth();
            this.storage = firebase.storage();
            
            // Проверка подключения с коротким таймаутом
            const testPromise = this.db.collection('test').limit(1).get();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 2000)
            );
            
            await Promise.race([testPromise, timeoutPromise]);
            
            // Если дошли сюда, значит Firebase работает
            this.isFirebaseConnected = true;
            this.demoMode = false;
            
            // Слушатель изменения аутентификации
            this.auth.onAuthStateChanged((user) => {
                this.handleAuthStateChange(user);
            });
            
            this.updateConnectionStatus('connected', 'Подключено к Firebase');
            this.showToast('success', 'Подключение установлено', 'Успешно подключились к Firebase');
            
            // Перезагружаем презентации из Firebase
            await this.loadPresentations();
            
        } catch (error) {
            console.log('Firebase недоступен, остаемся в демо-режиме:', error.message);
            // Остаемся в демо-режиме, ничего дополнительного не делаем
        }
    }
    
    updateConnectionStatus(status = 'connecting', text = 'Подключение...') {
        const indicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        
        if (indicator && statusText) {
            indicator.className = `status-indicator ${status}`;
            statusText.textContent = text;
        }
    }
    
    async handleAuthStateChange(user) {
        console.log('Изменение статуса аутентификации:', user ? user.email : 'не авторизован');
        this.currentUser = user;
        
        if (user && !this.demoMode) {
            // Получаем роль пользователя из Firestore
            try {
                const userDoc = await this.db.collection('users').doc(user.uid).get();
                if (userDoc.exists) {
                    this.userRole = userDoc.data().role || 'user';
                } else {
                    // Создаем профиль нового пользователя
                    await this.createUserProfile(user);
                    this.userRole = 'user';
                }
            } catch (error) {
                console.error('Ошибка получения роли пользователя:', error);
                this.userRole = 'user';
            }
        } else if (user && this.demoMode) {
            // В демо-режиме проверяем по email
            const demoUser = this.demoData.users.find(u => u.email === user.email);
            this.userRole = demoUser ? demoUser.role : 'user';
        } else {
            this.userRole = 'guest';
        }
        
        this.updateUI();
    }
    
    async createUserProfile(user) {
        try {
            await this.db.collection('users').doc(user.uid).set({
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || user.email.split('@')[0],
                role: 'user',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Ошибка создания профиля пользователя:', error);
        }
    }
    
    updateUI() {
        const loginBtn = document.getElementById('loginBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        const userInfo = document.getElementById('userInfo');
        const userDisplayName = document.getElementById('userDisplayName');
        const uploadBtn = document.getElementById('uploadBtn');
        const profileBtn = document.getElementById('profileBtn');
        const adminBtn = document.getElementById('adminBtn');
        
        console.log('Обновление UI, текущий пользователь:', this.currentUser ? this.currentUser.email : 'нет', 'роль:', this.userRole);
        
        if (this.currentUser) {
            if (loginBtn) loginBtn.classList.add('hidden');
            if (userInfo) userInfo.classList.remove('hidden');
            if (userDisplayName) {
                userDisplayName.textContent = this.currentUser.displayName || this.currentUser.email;
            }
            
            if (this.userRole === 'user' || this.userRole === 'admin') {
                if (uploadBtn) uploadBtn.classList.remove('hidden');
                if (profileBtn) profileBtn.classList.remove('hidden');
            }
            
            if (this.userRole === 'admin') {
                if (adminBtn) adminBtn.classList.remove('hidden');
            }
        } else {
            if (loginBtn) loginBtn.classList.remove('hidden');
            if (userInfo) userInfo.classList.add('hidden');
            if (uploadBtn) uploadBtn.classList.add('hidden');
            if (profileBtn) profileBtn.classList.add('hidden');
            if (adminBtn) adminBtn.classList.add('hidden');
        }
    }
    
    bindEvents() {
        console.log('Привязка событий...');
        
        // Навигация
        this.bindNavigation();
        
        // Аутентификация
        this.bindAuthentication();
        
        // Загрузка презентаций
        this.bindUpload();
        
        // Админ-панель
        this.bindAdminPanel();
        
        // Модальные окна
        this.bindModals();
        
        // PDF навигация
        this.bindPDFNavigation();
        
        // Фильтры
        this.bindFilters();
        
        console.log('События привязаны');
    }
    
    bindNavigation() {
        const homeBtn = document.getElementById('homeBtn');
        const loginBtn = document.getElementById('loginBtn');
        const uploadBtn = document.getElementById('uploadBtn');
        const adminBtn = document.getElementById('adminBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        
        if (homeBtn) {
            homeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showPage('home');
            });
        }
        
        if (loginBtn) {
            loginBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showPage('auth');
            });
        }
        
        if (uploadBtn) {
            uploadBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showPage('upload');
            });
        }
        
        if (adminBtn) {
            adminBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showPage('admin');
            });
        }
        
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        }
    }
    
    bindAuthentication() {
        const authForm = document.getElementById('authForm');
        const registerBtn = document.getElementById('registerBtn');
        const googleSignInBtn = document.getElementById('googleSignInBtn');
        
        if (authForm) {
            authForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleAuth(e);
            });
        }
        
        if (registerBtn) {
            registerBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleRegister();
            });
        }
        
        if (googleSignInBtn) {
            googleSignInBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.signInWithGoogle();
            });
        }
    }
    
    bindUpload() {
        const uploadForm = document.getElementById('uploadForm');
        if (uploadForm) {
            uploadForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleUpload(e);
            });
        }
    }
    
    bindAdminPanel() {
        const adminTabs = document.querySelectorAll('.admin-tab');
        adminTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                this.showAdminSection(e.target.dataset.tab);
            });
        });
    }
    
    bindModals() {
        const closeRoleModal = document.getElementById('closeRoleModal');
        const cancelRole = document.getElementById('cancelRole');
        const roleForm = document.getElementById('roleForm');
        
        if (closeRoleModal) {
            closeRoleModal.addEventListener('click', (e) => {
                e.preventDefault();
                this.hideModal('roleModal');
            });
        }
        
        if (cancelRole) {
            cancelRole.addEventListener('click', (e) => {
                e.preventDefault();
                this.hideModal('roleModal');
            });
        }
        
        if (roleForm) {
            roleForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleRoleChange(e);
            });
        }
    }
    
    bindPDFNavigation() {
        const backToHome = document.getElementById('backToHome');
        const prevPage = document.getElementById('prevPage');
        const nextPage = document.getElementById('nextPage');
        const zoomOut = document.getElementById('zoomOut');
        const zoomIn = document.getElementById('zoomIn');
        
        if (backToHome) {
            backToHome.addEventListener('click', (e) => {
                e.preventDefault();
                this.showPage('home');
            });
        }
        
        if (prevPage) {
            prevPage.addEventListener('click', (e) => {
                e.preventDefault();
                this.changePage(-1);
            });
        }
        
        if (nextPage) {
            nextPage.addEventListener('click', (e) => {
                e.preventDefault();
                this.changePage(1);
            });
        }
        
        if (zoomOut) {
            zoomOut.addEventListener('click', (e) => {
                e.preventDefault();
                this.changeZoom(-0.25);
            });
        }
        
        if (zoomIn) {
            zoomIn.addEventListener('click', (e) => {
                e.preventDefault();
                this.changeZoom(0.25);
            });
        }
    }
    
    bindFilters() {
        const categoryFilter = document.getElementById('categoryFilter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', () => {
                this.loadPresentations();
            });
        }
    }
    
    async handleAuth(e) {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value.trim();
        
        if (!email || !password) {
            this.showToast('error', 'Ошибка', 'Заполните все поля');
            return;
        }
        
        console.log('Попытка входа:', email);
        
        if (this.demoMode) {
            this.handleDemoAuth(email, password);
            return;
        }
        
        try {
            await this.auth.signInWithEmailAndPassword(email, password);
            this.showToast('success', 'Вход выполнен', 'Добро пожаловать!');
            this.showPage('home');
        } catch (error) {
            console.error('Ошибка входа:', error);
            this.showToast('error', 'Ошибка входа', this.getAuthErrorMessage(error));
        }
    }
    
    handleDemoAuth(email, password) {
        console.log('Демо-вход для:', email);
        const demoUser = this.demoData.users.find(u => u.email === email);
        if (demoUser && password === 'demo123') {
            this.currentUser = { 
                email, 
                displayName: demoUser.displayName, 
                uid: demoUser.id 
            };
            this.userRole = demoUser.role;
            this.updateUI();
            this.showToast('success', 'Демо-вход', `Добро пожаловать, ${demoUser.displayName}!`);
            this.showPage('home');
        } else {
            this.showToast('error', 'Ошибка входа', 'Неверные данные. Попробуйте: admin@example.com / demo123 или user@example.com / demo123');
        }
    }
    
    async handleRegister() {
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value.trim();
        
        if (!email || !password) {
            this.showToast('error', 'Ошибка', 'Заполните все поля');
            return;
        }
        
        if (this.demoMode) {
            this.showToast('warning', 'Демо-режим', 'Регистрация недоступна в демо-режиме');
            return;
        }
        
        try {
            await this.auth.createUserWithEmailAndPassword(email, password);
            this.showToast('success', 'Регистрация завершена', 'Добро пожаловать!');
            this.showPage('home');
        } catch (error) {
            console.error('Ошибка регистрации:', error);
            this.showToast('error', 'Ошибка регистрации', this.getAuthErrorMessage(error));
        }
    }
    
    async signInWithGoogle() {
        if (this.demoMode) {
            this.showToast('warning', 'Демо-режим', 'Вход через Google недоступен в демо-режиме');
            return;
        }
        
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            await this.auth.signInWithPopup(provider);
            this.showToast('success', 'Вход выполнен', 'Добро пожаловать!');
            this.showPage('home');
        } catch (error) {
            console.error('Ошибка входа через Google:', error);
            this.showToast('error', 'Ошибка входа', 'Не удалось войти через Google');
        }
    }
    
    async logout() {
        if (!this.demoMode && this.auth) {
            await this.auth.signOut();
        } else {
            this.currentUser = null;
            this.userRole = 'guest';
            this.updateUI();
        }
        this.showToast('info', 'Выход', 'До свидания!');
        this.showPage('home');
    }
    
    async handleUpload(e) {
        e.preventDefault();
        
        if (this.demoMode) {
            this.showToast('warning', 'Демо-режим', 'Загрузка файлов недоступна в демо-режиме');
            return;
        }
        
        const file = document.getElementById('presentationFile').files[0];
        const title = document.getElementById('title').value.trim();
        const description = document.getElementById('description').value.trim();
        const category = document.getElementById('category').value;
        const isPublic = document.getElementById('isPublic').checked;
        
        if (!file || !title) {
            this.showToast('error', 'Ошибка', 'Заполните обязательные поля');
            return;
        }
        
        try {
            this.showToast('info', 'Загрузка', 'Загружаем презентацию...');
            
            // Загружаем файл в Storage
            const storageRef = this.storage.ref(`presentations/${Date.now()}_${file.name}`);
            const snapshot = await storageRef.put(file);
            const downloadURL = await snapshot.ref.getDownloadURL();
            
            // Сохраняем метаданные в Firestore
            await this.db.collection('presentations').add({
                title,
                description,
                category,
                isPublic,
                fileURL: downloadURL,
                fileName: file.name,
                ownerId: this.currentUser.uid,
                ownerName: this.currentUser.displayName || this.currentUser.email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                viewCount: 0,
                moderationStatus: 'approved'
            });
            
            this.showToast('success', 'Успешно загружено', 'Презентация добавлена в каталог');
            document.getElementById('uploadForm').reset();
            this.showPage('home');
            this.loadPresentations();
            
        } catch (error) {
            console.error('Ошибка загрузки:', error);
            this.showToast('error', 'Ошибка загрузки', 'Не удалось загрузить презентацию');
        }
    }
    
    async loadPresentations() {
        console.log('Загрузка презентаций...');
        const grid = document.getElementById('presentationsGrid');
        const loading = document.getElementById('loadingIndicator');
        const categoryFilter = document.getElementById('categoryFilter');
        
        if (!grid) {
            console.error('Не найден элемент presentationsGrid');
            return;
        }
        
        const selectedCategory = categoryFilter ? categoryFilter.value : '';
        
        if (loading) loading.classList.remove('hidden');
        grid.innerHTML = '';
        
        try {
            let presentations = [];
            
            console.log('Режим загрузки:', this.demoMode ? 'демо' : 'firebase');
            
            if (this.demoMode) {
                console.log('Загружаем демо-презентации...');
                presentations = this.demoData.presentations.filter(p => 
                    p.isPublic && (!selectedCategory || p.category === selectedCategory)
                );
                console.log('Найдено демо-презентаций:', presentations.length, presentations);
            } else {
                console.log('Загружаем презентации из Firebase...');
                let query = this.db.collection('presentations').where('isPublic', '==', true);
                
                if (selectedCategory) {
                    query = query.where('category', '==', selectedCategory);
                }
                
                const snapshot = await query.orderBy('createdAt', 'desc').get();
                presentations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                console.log('Найдено презентаций из Firebase:', presentations.length);
            }
            
            if (presentations.length === 0) {
                grid.innerHTML = `
                    <div class="text-center" style="grid-column: 1/-1; padding: 2rem; color: var(--color-text-secondary);">
                        <p>Презентации не найдены</p>
                        ${this.demoMode ? '<p><small>Работаем в демо-режиме</small></p>' : ''}
                    </div>
                `;
            } else {
                presentations.forEach(presentation => {
                    const card = this.createPresentationCard(presentation);
                    grid.appendChild(card);
                });
                console.log('Презентации добавлены в DOM');
            }
            
        } catch (error) {
            console.error('Ошибка загрузки презентаций:', error);
            grid.innerHTML = `
                <div class="text-center" style="grid-column: 1/-1; padding: 2rem; color: var(--color-error);">
                    <p>Ошибка загрузки презентаций</p>
                    <small>${error.message}</small>
                </div>
            `;
        }
        
        if (loading) loading.classList.add('hidden');
    }
    
    createPresentationCard(presentation) {
        const card = document.createElement('div');
        card.className = 'presentation-card';
        card.addEventListener('click', () => this.openPresentation(presentation));
        
        const date = presentation.createdAt ? 
            (presentation.createdAt.toDate ? presentation.createdAt.toDate() : presentation.createdAt) : 
            new Date();
        
        card.innerHTML = `
            <div class="presentation-thumbnail">📄</div>
            <div class="presentation-content">
                <h3>${this.escapeHtml(presentation.title)}</h3>
                <p>${this.escapeHtml(presentation.description || 'Описание отсутствует')}</p>
                <div class="presentation-meta">
                    <span class="status status--info">${this.getCategoryName(presentation.category)}</span>
                    <span class="presentation-author">👤 ${this.escapeHtml(presentation.ownerName || presentation.author || 'Неизвестно')}</span>
                </div>
                <div class="presentation-meta" style="margin-top: 8px;">
                    <small>${date.toLocaleDateString('ru-RU')}</small>
                    <small>👁 ${presentation.viewCount || 0}</small>
                </div>
            </div>
        `;
        
        console.log('Создана карточка для:', presentation.title);
        return card;
    }
    
    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    
    getCategoryName(category) {
        const categories = {
            business: 'Бизнес',
            education: 'Образование', 
            tech: 'Технологии'
        };
        return categories[category] || category;
    }
    
    async openPresentation(presentation) {
        console.log('Открытие презентации:', presentation.title);
        this.currentPresentation = presentation;
        
        if (!this.demoMode && presentation.id) {
            // Увеличиваем счетчик просмотров
            try {
                await this.db.collection('presentations').doc(presentation.id).update({
                    viewCount: firebase.firestore.FieldValue.increment(1)
                });
            } catch (error) {
                console.warn('Не удалось обновить счетчик просмотров:', error);
            }
        }
        
        this.showPage('presentation');
        this.displayPresentationInfo();
        
        if (presentation.fileURL || this.demoMode) {
            this.loadPDF(presentation.fileURL || 'demo');
        }
    }
    
    displayPresentationInfo() {
        const presentation = this.currentPresentation;
        const date = presentation.createdAt ? 
            (presentation.createdAt.toDate ? presentation.createdAt.toDate() : presentation.createdAt) : 
            new Date();
        
        const titleEl = document.getElementById('presentationTitle');
        const descEl = document.getElementById('presentationDescription');
        const categoryEl = document.getElementById('presentationCategory');
        const authorEl = document.getElementById('presentationAuthor');
        const dateEl = document.getElementById('presentationDate');
        
        if (titleEl) titleEl.textContent = presentation.title;
        if (descEl) descEl.textContent = presentation.description || 'Описание отсутствует';
        if (categoryEl) {
            categoryEl.textContent = this.getCategoryName(presentation.category);
            categoryEl.className = 'status status--info';
        }
        if (authorEl) authorEl.textContent = `Автор: ${presentation.ownerName || presentation.author || 'Неизвестно'}`;
        if (dateEl) dateEl.textContent = `Дата: ${date.toLocaleDateString('ru-RU')}`;
    }
    
    async loadPDF(url) {
        if (url === 'demo') {
            // Создаем демо PDF canvas
            setTimeout(() => this.renderDemoPresentation(), 100);
            return;
        }
        
        try {
            const loadingTask = pdfjsLib.getDocument(url);
            this.pdfDoc = await loadingTask.promise;
            this.pageNum = 1;
            this.renderPage(this.pageNum);
        } catch (error) {
            console.error('Ошибка загрузки PDF:', error);
            this.showToast('error', 'Ошибка', 'Не удалось загрузить презентацию');
        }
    }
    
    renderDemoPresentation() {
        const canvas = document.getElementById('pdfCanvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        canvas.width = 800;
        canvas.height = 600;
        
        // Белый фон
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Заголовок
        ctx.fillStyle = '#1f343b';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Демо презентация', canvas.width / 2, 150);
        
        // Подзаголовок
        ctx.font = '24px Arial';
        ctx.fillText('Это демонстрация просмотра презентаций', canvas.width / 2, 200);
        
        // Контент
        ctx.font = '18px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('• В реальном режиме здесь будет отображаться PDF', 100, 300);
        ctx.fillText('• Поддерживается навигация по страницам', 100, 340);
        ctx.fillText('• Масштабирование и полноэкранный режим', 100, 380);
        ctx.fillText('• Загрузка с сервера Firebase Storage', 100, 420);
        
        // Обновляем информацию о странице
        const pageInfo = document.getElementById('pageInfo');
        if (pageInfo) pageInfo.textContent = 'Демо-страница';
    }
    
    async renderPage(num) {
        if (!this.pdfDoc) return;
        
        const page = await this.pdfDoc.getPage(num);
        const canvas = document.getElementById('pdfCanvas');
        const ctx = canvas.getContext('2d');
        
        const viewport = page.getViewport({ scale: this.scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        
        await page.render(renderContext).promise;
        
        // Обновляем информацию о странице
        const pageInfo = document.getElementById('pageInfo');
        if (pageInfo) pageInfo.textContent = `Страница ${num} из ${this.pdfDoc.numPages}`;
    }
    
    changePage(delta) {
        if (!this.pdfDoc) return;
        
        const newPage = this.pageNum + delta;
        if (newPage >= 1 && newPage <= this.pdfDoc.numPages) {
            this.pageNum = newPage;
            this.renderPage(this.pageNum);
        }
    }
    
    changeZoom(delta) {
        this.scale = Math.max(0.5, Math.min(3, this.scale + delta));
        if (this.pdfDoc) {
            this.renderPage(this.pageNum);
        }
    }
    
    showPage(pageName) {
        console.log('Показ страницы:', pageName);
        
        // Скрываем все страницы
        const pages = document.querySelectorAll('.page');
        pages.forEach(page => {
            page.classList.add('hidden');
        });
        
        // Показываем нужную страницу
        const targetPage = document.getElementById(pageName + 'Page');
        if (targetPage) {
            targetPage.classList.remove('hidden');
            this.currentPage = pageName;
            console.log('Страница', pageName, 'показана');
        } else {
            console.error('Страница не найдена:', pageName + 'Page');
        }
        
        // Специальная логика для админ-панели
        if (pageName === 'admin' && this.userRole === 'admin') {
            setTimeout(() => this.loadAdminData(), 100);
        }
    }
    
    async loadAdminData() {
        console.log('Загрузка данных админ-панели...');
        this.showAdminSection('users');
        await this.loadAdminUsers();
        await this.loadAdminPresentations(); 
        await this.loadAdminStats();
    }
    
    showAdminSection(section) {
        console.log('Показ админ-секции:', section);
        
        // Обновляем табы
        const tabs = document.querySelectorAll('.admin-tab');
        tabs.forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.tab === section) {
                tab.classList.add('active');
            }
        });
        
        // Показываем нужную секцию
        const sections = document.querySelectorAll('.admin-section');
        sections.forEach(sectionEl => {
            sectionEl.classList.add('hidden');
        });
        
        const targetSection = document.getElementById('admin' + section.charAt(0).toUpperCase() + section.slice(1));
        if (targetSection) {
            targetSection.classList.remove('hidden');
        }
    }
    
    async loadAdminUsers() {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        try {
            let users;
            
            if (this.demoMode) {
                users = this.demoData.users;
            } else {
                const snapshot = await this.db.collection('users').get();
                users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }
            
            users.forEach(user => {
                const row = document.createElement('tr');
                const createdDate = user.createdAt ? 
                    (user.createdAt.toDate ? user.createdAt.toDate() : user.createdAt) : 
                    new Date();
                
                row.innerHTML = `
                    <td>${this.escapeHtml(user.email)}</td>
                    <td>${this.escapeHtml(user.displayName || 'Не указано')}</td>
                    <td><span class="status status--${user.role === 'admin' ? 'error' : 'info'}">${this.getRoleName(user.role)}</span></td>
                    <td>${createdDate.toLocaleDateString('ru-RU')}</td>
                    <td>
                        <button class="btn btn--sm btn--outline" onclick="app.showRoleModal('${user.id}', '${this.escapeHtml(user.email)}', '${user.role}')">
                            Изменить роль
                        </button>
                        ${user.role !== 'admin' ? `<button class="btn btn--sm btn--outline" style="color: var(--color-error);" onclick="app.deleteUser('${user.id}')">Удалить</button>` : ''}
                    </td>
                `;
                tbody.appendChild(row);
            });
            
        } catch (error) {
            console.error('Ошибка загрузки пользователей:', error);
            tbody.innerHTML = '<tr><td colspan="5">Ошибка загрузки данных</td></tr>';
        }
    }
    
    async loadAdminPresentations() {
        const tbody = document.getElementById('presentationsTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        try {
            let presentations;
            
            if (this.demoMode) {
                presentations = this.demoData.presentations;
            } else {
                const snapshot = await this.db.collection('presentations').orderBy('createdAt', 'desc').get();
                presentations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }
            
            presentations.forEach(presentation => {
                const row = document.createElement('tr');
                const date = presentation.createdAt ? 
                    (presentation.createdAt.toDate ? presentation.createdAt.toDate() : presentation.createdAt) : 
                    new Date();
                
                row.innerHTML = `
                    <td>${this.escapeHtml(presentation.title)}</td>
                    <td>${this.escapeHtml(presentation.ownerName || presentation.author || 'Неизвестно')}</td>
                    <td><span class="status status--info">${this.getCategoryName(presentation.category)}</span></td>
                    <td><span class="status status--${presentation.isPublic ? 'success' : 'warning'}">${presentation.isPublic ? 'Публичная' : 'Приватная'}</span></td>
                    <td>${date.toLocaleDateString('ru-RU')}</td>
                    <td>
                        <button class="btn btn--sm btn--outline" onclick="app.viewPresentation('${presentation.id}')">Просмотр</button>
                        <button class="btn btn--sm btn--outline" style="color: var(--color-error);" onclick="app.deletePresentation('${presentation.id}')">Удалить</button>
                    </td>
                `;
                tbody.appendChild(row);
            });
            
        } catch (error) {
            console.error('Ошибка загрузки презентаций:', error);
            tbody.innerHTML = '<tr><td colspan="6">Ошибка загрузки данных</td></tr>';
        }
    }
    
    viewPresentation(presentationId) {
        // Находим презентацию по ID
        let presentation = null;
        
        if (this.demoMode) {
            presentation = this.demoData.presentations.find(p => p.id === presentationId);
        } else {
            // В реальном режиме нужно будет загрузить из Firestore
            // Пока просто покажем сообщение
            this.showToast('info', 'Функция', 'Просмотр презентации из админ-панели');
            return;
        }
        
        if (presentation) {
            this.openPresentation(presentation);
        }
    }
    
    async loadAdminStats() {
        try {
            let totalUsers, totalPresentations, totalViews;
            
            if (this.demoMode) {
                totalUsers = this.demoData.users.length;
                totalPresentations = this.demoData.presentations.length;
                totalViews = this.demoData.presentations.reduce((sum, p) => sum + (p.viewCount || 0), 0);
            } else {
                const usersSnapshot = await this.db.collection('users').get();
                const presentationsSnapshot = await this.db.collection('presentations').get();
                
                totalUsers = usersSnapshot.size;
                totalPresentations = presentationsSnapshot.size;
                totalViews = 0;
                
                presentationsSnapshot.docs.forEach(doc => {
                    totalViews += doc.data().viewCount || 0;
                });
            }
            
            const totalUsersEl = document.getElementById('totalUsers');
            const totalPresentationsEl = document.getElementById('totalPresentations');
            const totalViewsEl = document.getElementById('totalViews');
            
            if (totalUsersEl) totalUsersEl.textContent = totalUsers;
            if (totalPresentationsEl) totalPresentationsEl.textContent = totalPresentations;
            if (totalViewsEl) totalViewsEl.textContent = totalViews;
            
        } catch (error) {
            console.error('Ошибка загрузки статистики:', error);
            const totalUsersEl = document.getElementById('totalUsers');
            const totalPresentationsEl = document.getElementById('totalPresentations');
            const totalViewsEl = document.getElementById('totalViews');
            
            if (totalUsersEl) totalUsersEl.textContent = '—';
            if (totalPresentationsEl) totalPresentationsEl.textContent = '—';
            if (totalViewsEl) totalViewsEl.textContent = '—';
        }
    }
    
    getRoleName(role) {
        const roles = {
            guest: 'Гость',
            user: 'Пользователь',
            admin: 'Администратор'
        };
        return roles[role] || role;
    }
    
    showRoleModal(userId, email, currentRole) {
        const userEmailEl = document.getElementById('roleUserEmail');
        const newRoleEl = document.getElementById('newRole');
        const modalEl = document.getElementById('roleModal');
        const formEl = document.getElementById('roleForm');
        
        if (userEmailEl) userEmailEl.textContent = email;
        if (newRoleEl) newRoleEl.value = currentRole;
        if (modalEl) modalEl.classList.remove('hidden');
        if (formEl) formEl.dataset.userId = userId;
    }
    
    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('hidden');
    }
    
    async handleRoleChange(e) {
        e.preventDefault();
        
        if (this.demoMode) {
            this.showToast('warning', 'Демо-режим', 'Изменение ролей недоступно в демо-режиме');
            this.hideModal('roleModal');
            return;
        }
        
        const userId = e.target.dataset.userId;
        const newRole = document.getElementById('newRole').value;
        
        try {
            await this.db.collection('users').doc(userId).update({ role: newRole });
            this.showToast('success', 'Роль изменена', 'Роль пользователя успешно обновлена');
            this.hideModal('roleModal');
            await this.loadAdminUsers();
        } catch (error) {
            console.error('Ошибка изменения роли:', error);
            this.showToast('error', 'Ошибка', 'Не удалось изменить роль пользователя');
        }
    }
    
    async deleteUser(userId) {
        if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) {
            return;
        }
        
        if (this.demoMode) {
            this.showToast('warning', 'Демо-режим', 'Удаление пользователей недоступно в демо-режиме');
            return;
        }
        
        try {
            await this.db.collection('users').doc(userId).delete();
            this.showToast('success', 'Пользователь удален', 'Пользователь успешно удален из системы');
            await this.loadAdminUsers();
        } catch (error) {
            console.error('Ошибка удаления пользователя:', error);
            this.showToast('error', 'Ошибка', 'Не удалось удалить пользователя');
        }
    }
    
    async deletePresentation(presentationId) {
        if (!confirm('Вы уверены, что хотите удалить эту презентацию?')) {
            return;
        }
        
        if (this.demoMode) {
            this.showToast('warning', 'Демо-режим', 'Удаление презентаций недоступно в демо-режиме');
            return;
        }
        
        try {
            await this.db.collection('presentations').doc(presentationId).delete();
            this.showToast('success', 'Презентация удалена', 'Презентация успешно удалена');
            await this.loadAdminPresentations();
            this.loadPresentations(); // Обновляем основной каталог
        } catch (error) {
            console.error('Ошибка удаления презентации:', error);
            this.showToast('error', 'Ошибка', 'Не удалось удалить презентацию');
        }
    }
    
    showToast(type, title, message) {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        toast.innerHTML = `
            <div class="toast-content">
                <div class="toast-title">${this.escapeHtml(title)}</div>
                <div class="toast-message">${this.escapeHtml(message)}</div>
            </div>
            <button class="toast-close">&times;</button>
        `;
        
        container.appendChild(toast);
        
        // Автоматическое удаление через 5 секунд
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 5000);
        
        // Кнопка закрытия
        const closeBtn = toast.querySelector('.toast-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                toast.remove();
            });
        }
    }
    
    getAuthErrorMessage(error) {
        const errorMessages = {
            'auth/user-not-found': 'Пользователь не найден',
            'auth/wrong-password': 'Неверный пароль',
            'auth/email-already-in-use': 'Email уже используется',
            'auth/weak-password': 'Слишком простой пароль',
            'auth/invalid-email': 'Неверный формат email',
            'auth/popup-closed-by-user': 'Окно входа было закрыто'
        };
        
        return errorMessages[error.code] || 'Произошла ошибка при входе';
    }
}

// Глобальная переменная для приложения
let app = null;

// Инициализация приложения при загрузке DOM
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM загружен, инициализация приложения...');
    
    // Создаем экземпляр приложения
    app = new PresentationHosting();
    
    // Экспортируем в window для глобального доступа
    window.app = app;
    
    // Инициализируем приложение
    await app.init();
    
    console.log('Приложение готово к работе');
});