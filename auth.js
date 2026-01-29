/**
 * Simple Password Protection for Performance Review Pages
 * Password: 8888
 */

(function () {
    const CORRECT_PASSWORD = '8888';
    const AUTH_KEY = 'performance_review_auth';
    const AUTH_EXPIRY_KEY = 'performance_review_auth_expiry';
    const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours in milliseconds

    // Check if already authenticated
    function isAuthenticated() {
        const authStatus = sessionStorage.getItem(AUTH_KEY);
        const expiry = sessionStorage.getItem(AUTH_EXPIRY_KEY);

        if (authStatus === 'true' && expiry) {
            const expiryTime = parseInt(expiry, 10);
            if (Date.now() < expiryTime) {
                return true;
            } else {
                // Expired, clear auth
                sessionStorage.removeItem(AUTH_KEY);
                sessionStorage.removeItem(AUTH_EXPIRY_KEY);
            }
        }
        return false;
    }

    // Set authentication
    function setAuthenticated() {
        sessionStorage.setItem(AUTH_KEY, 'true');
        sessionStorage.setItem(AUTH_EXPIRY_KEY, (Date.now() + SESSION_DURATION).toString());
    }

    // Create and show login overlay
    function showLoginOverlay() {
        // Overlay will cover everything with z-index

        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'auth-overlay';
        overlay.innerHTML = `
            <style>
                #auth-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 999999;
                    font-family: 'Noto Sans TC', sans-serif;
                }
                .auth-box {
                    background: white;
                    padding: 40px 50px;
                    border-radius: 16px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    text-align: center;
                    max-width: 400px;
                    width: 90%;
                    animation: slideIn 0.3s ease-out;
                }
                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .auth-box h2 {
                    margin: 0 0 10px 0;
                    color: #1a1a2e;
                    font-size: 1.8rem;
                    font-weight: 700;
                }
                .auth-box p {
                    color: #666;
                    margin: 0 0 30px 0;
                    font-size: 0.95rem;
                }
                .auth-box .icon {
                    font-size: 3rem;
                    margin-bottom: 20px;
                }
                .auth-input {
                    width: 100%;
                    padding: 15px 20px;
                    font-size: 1.2rem;
                    border: 2px solid #e0e0e0;
                    border-radius: 10px;
                    text-align: center;
                    letter-spacing: 8px;
                    font-weight: 600;
                    transition: all 0.3s ease;
                    box-sizing: border-box;
                }
                .auth-input:focus {
                    outline: none;
                    border-color: #667eea;
                    box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.2);
                }
                .auth-input.error {
                    border-color: #e74c3c;
                    animation: shake 0.4s ease;
                }
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    20%, 60% { transform: translateX(-10px); }
                    40%, 80% { transform: translateX(10px); }
                }
                .auth-btn {
                    width: 100%;
                    padding: 15px;
                    margin-top: 20px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-size: 1.1rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }
                .auth-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
                }
                .auth-btn:active {
                    transform: translateY(0);
                }
                .error-msg {
                    color: #e74c3c;
                    font-size: 0.9rem;
                    margin-top: 15px;
                    height: 20px;
                }
            </style>
            <div class="auth-box">
                <div class="icon">🔐</div>
                <h2>績效考核系統</h2>
                <p>請輸入密碼以存取此頁面</p>
                <input type="password" class="auth-input" id="auth-password" 
                       placeholder="••••" maxlength="10" autocomplete="off">
                <button class="auth-btn" id="auth-submit">登入</button>
                <div class="error-msg" id="auth-error"></div>
            </div>
        `;

        document.body.appendChild(overlay);

        const passwordInput = document.getElementById('auth-password');
        const submitBtn = document.getElementById('auth-submit');
        const errorMsg = document.getElementById('auth-error');

        // Focus on input
        setTimeout(() => passwordInput.focus(), 100);

        // Handle submit
        function handleSubmit() {
            const password = passwordInput.value;

            if (password === CORRECT_PASSWORD) {
                setAuthenticated();
                overlay.style.opacity = '0';
                overlay.style.transition = 'opacity 0.3s ease';
                setTimeout(() => {
                    overlay.remove();
                    document.body.style.visibility = 'visible';
                }, 300);
            } else {
                passwordInput.classList.add('error');
                errorMsg.textContent = '密碼錯誤，請重試';
                passwordInput.value = '';
                setTimeout(() => {
                    passwordInput.classList.remove('error');
                }, 400);
            }
        }

        submitBtn.addEventListener('click', handleSubmit);
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleSubmit();
            }
        });
    }

    // Main logic - must wait for DOM
    function init() {
        if (isAuthenticated()) {
            // Already authenticated, show page
            document.body.style.visibility = 'visible';
        } else {
            // Need authentication
            showLoginOverlay();
        }
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOM is already ready
        init();
    }
})();
