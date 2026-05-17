document.addEventListener('DOMContentLoaded', () => {
    // Reveal animations on scroll
    const revealElements = document.querySelectorAll('.reveal');
    
    const revealOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    };
    
    const revealOnScroll = new IntersectionObserver(function(entries, observer) {
        entries.forEach(entry => {
            if (!entry.isIntersecting) {
                return;
            } else {
                const delay = entry.target.style.getPropertyValue('--delay');
                if (delay) {
                    setTimeout(() => {
                        entry.target.classList.add('active');
                    }, parseFloat(delay) * 1000);
                } else {
                    entry.target.classList.add('active');
                }
                observer.unobserve(entry.target);
            }
        });
    }, revealOptions);
    
    revealElements.forEach(el => {
        revealOnScroll.observe(el);
    });

    let currentLang = 'en';

    // Form submission and download preview
    const form = document.getElementById('downloadForm');
    if (form) {
        const input = document.getElementById('urlInput');
        const btn = form.querySelector('.btn-submit');
        const resultCard = document.getElementById('downloadResult');
        const resultThumbnail = document.getElementById('resultThumbnail');
        const resultPlatform = document.getElementById('resultPlatform');
        const resultMediaType = document.getElementById('resultMediaType');
        const resultTitle = document.getElementById('resultTitle');
        const downloadActions = document.getElementById('downloadActions');
        const errorBox = document.getElementById('downloadError');
        const originalBtnHTML = btn.innerHTML;

        const processText = typeof translations !== 'undefined' && translations[currentLang]?.process_text ? translations[currentLang].process_text : 'Processing...';
        const readyText = typeof translations !== 'undefined' && translations[currentLang]?.ready_text ? translations[currentLang].ready_text : 'Ready';

        const spinnerHTML = `<svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg> <span>${processText}</span>`;

        if (!document.getElementById('spinner-style')) {
            const style = document.createElement('style');
            style.id = 'spinner-style';
            style.innerHTML = `
                @keyframes spin { 100% { transform: rotate(360deg); } }
                .spinner { animation: spin 1s linear infinite; width: 16px; height: 16px; }
            `;
            document.head.appendChild(style);
        }

        const setLoading = (loading) => {
            if (loading) {
                btn.disabled = true;
                btn.classList.add('loading');
                btn.innerHTML = spinnerHTML;
                btn.style.cursor = 'progress';
            } else {
                btn.disabled = false;
                btn.classList.remove('loading');
                btn.innerHTML = originalBtnHTML;
                btn.style.cursor = '';
            }
        };

        const isValidInputUrl = (value) => {
            try {
                const url = new URL(value.trim());
                return /youtube|youtu\.be|instagram|facebook|x\.com|twitter|t\.co/i.test(url.hostname);
            } catch {
                return false;
            }
        };

        const hideError = () => {
            if (errorBox) {
                errorBox.classList.add('hidden');
                errorBox.textContent = '';
            }
        };

        const showError = (message) => {
            hideResult();
            if (!errorBox) return;
            errorBox.textContent = message;
            errorBox.classList.remove('hidden');
        };

        const hideResult = () => {
            if (resultCard) {
                resultCard.classList.add('hidden');
            }
        };

        const renderResult = (data) => {
            if (!resultCard) return;

            hideError();
            const previewUrl = data.thumbnail && /\.(jpe?g|png|webp|gif|svg)(\?.*)?$/i.test(data.thumbnail) ? data.thumbnail : '';
            resultThumbnail.src = previewUrl;
            resultThumbnail.alt = data.title || 'Media preview';
            resultThumbnail.style.display = previewUrl ? '' : 'none';
            resultPlatform.textContent = data.platform || 'Instagram';
            if (resultMediaType) resultMediaType.textContent = data.mediaType || 'Media';
            resultTitle.textContent = data.title || 'Download ready';
            downloadActions.innerHTML = data.downloads.map((item) => {
                const label = item.note ? `${item.quality} · ${item.ext.toUpperCase()} · ${item.note}` : `${item.quality} · ${item.ext.toUpperCase()}`;
                const downloadUrl = `/api/download/file/${item.id}?url=${encodeURIComponent(item.url)}&title=${encodeURIComponent(data.title || 'download')}&ext=${item.ext}`;
                return `<a class="download-option" href="${downloadUrl}" target="_blank" rel="noopener noreferrer">${label}</a>`;
            }).join('');
            resultCard.classList.remove('hidden');
        };

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const url = input.value.trim();
            if (!url) return;
            if (!isValidInputUrl(url)) {
                showError('Please enter a valid supported link from YouTube, Instagram, Facebook, or X/Twitter.');
                return;
            }

            setLoading(true);
            hideError();
            hideResult();

            try {
                const response = await fetch('/api/download', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ url })
                });

                const result = await response.json();
                if (!response.ok || !result.success) {
                    throw new Error(result.message || 'Unable to process the link.');
                }

                renderResult(result);
                input.value = '';
            } catch (error) {
                showError(error.message || 'Server error. Please try again later.');
            } finally {
                setLoading(false);
            }
        });
    }

    // Platform interactive logic (for supported platforms grid)
    const platformContainers = document.querySelectorAll('.platform-container');
    
    platformContainers.forEach(container => {
        container.addEventListener('click', (e) => {
            // Subtle pulse
            container.style.transform = 'scale(0.95)';
            setTimeout(() => {
                container.style.transform = '';
            }, 150);
        });
    });

    // Language Dropdown Toggle
    const langSelectors = document.querySelectorAll('.lang-selector-container');
    const langOptions = document.querySelectorAll('.lang-dropdown a');
    const currentLangCodeSpan = document.getElementById('current-lang-code');
    const mobileLangCodeSpans = document.querySelectorAll('.current-lang-code');
    const footerLangTextSpan = document.getElementById('footer-lang-text');

    langSelectors.forEach(langSelector => {
        const langToggle = langSelector.querySelector('.lang-toggle');
        
        if (!langToggle) return;

        langToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            langSelector.classList.toggle('active');
        });
    });

    // Close when clicking outside any language selector
    document.addEventListener('click', (e) => {
        langSelectors.forEach(langSelector => {
            if (!langSelector.contains(e.target)) {
                langSelector.classList.remove('active');
            }
        });
    });

    // Translation Engine
    function setLanguage(lang) {
        if (typeof translations === 'undefined' || !translations[lang]) return;
        currentLang = lang;
        
        // Update RTL for Arabic
        if (lang === 'ar') {
            document.documentElement.setAttribute('dir', 'rtl');
            document.body.style.textAlign = 'right';
        } else {
            document.documentElement.setAttribute('dir', 'ltr');
            document.body.style.textAlign = 'left';
        }

        // Update all elements with data-i18n
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const target = el.getAttribute('data-i18n-target');
            if (translations[lang][key]) {
                if (target === 'placeholder') {
                    el.setAttribute('placeholder', translations[lang][key]);
                } else {
                    el.innerHTML = translations[lang][key];
                }
            }
        });

        // Update Active Class in dropdown and display spans
        if (langOptions.length > 0) {
            langOptions.forEach(opt => {
                if (opt.getAttribute('data-lang') === lang) {
                    opt.classList.add('active');
                    if (currentLangCodeSpan) currentLangCodeSpan.textContent = lang.toUpperCase();
                    if (mobileLangCodeSpans.length) {
                        mobileLangCodeSpans.forEach(span => span.textContent = lang.toUpperCase());
                    }
                    if (footerLangTextSpan) footerLangTextSpan.textContent = opt.textContent;
                } else {
                    opt.classList.remove('active');
                }
            });
        }
    }

    // Language selection listeners
    langOptions.forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.preventDefault();
            const lang = opt.getAttribute('data-lang');
            setLanguage(lang);
            if (langSelector) langSelector.classList.remove('active');
        });
    });

    // Initialize default language
    setLanguage('en');


    // Staggered initial reveal
    setTimeout(() => {
        const nav = document.querySelector('.navbar');
        if(nav) nav.classList.add('active');
        
        const heroReveals = document.querySelectorAll('.hero .reveal');
        heroReveals.forEach((el, index) => {
            setTimeout(() => {
                el.classList.add('active');
            }, index * 100);
        });
    }, 50);

    // Mobile menu toggle
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
    const mobileMenuClose = document.querySelector('.mobile-menu-close');
    const mobileMenuLinks = document.querySelectorAll('.mobile-menu-list a');

    function openMobileMenu() {
        if (!mobileMenuOverlay) return;
        mobileMenuOverlay.classList.add('active');
        mobileMenuOverlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }

    function closeMobileMenu() {
        if (!mobileMenuOverlay) return;
        mobileMenuOverlay.classList.remove('active');
        mobileMenuOverlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        langSelectors.forEach(langSelector => langSelector.classList.remove('active'));
    }

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', openMobileMenu);
    }

    if (mobileMenuClose) {
        mobileMenuClose.addEventListener('click', closeMobileMenu);
    }

    if (mobileMenuOverlay) {
        mobileMenuOverlay.addEventListener('click', (e) => {
            if (e.target === mobileMenuOverlay) {
                closeMobileMenu();
            }
        });
    }

    mobileMenuLinks.forEach(link => {
        link.addEventListener('click', closeMobileMenu);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeMobileMenu();
        }
    });

    // Privacy Policy Modal Functionality
    const privacyModal = document.getElementById('privacyModal');
    const privacyLink = document.querySelector('a[data-i18n="foot_privacy"]');
    const privacyModalClose = privacyModal?.querySelector('.modal-close');

    // Terms of Service Modal Functionality
    const termsModal = document.getElementById('termsModal');
    const termsLink = document.querySelector('a[data-i18n="foot_terms"]');
    const termsModalClose = termsModal?.querySelector('.modal-close');

    // Cookie Policy Modal Functionality
    const cookieModal = document.getElementById('cookieModal');
    const cookieLink = document.querySelector('a[data-i18n="foot_cookie"]');
    const cookieModalClose = cookieModal?.querySelector('.modal-close');

    function openModal(modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal(modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Privacy Policy Modal Events
    if (privacyLink) {
        privacyLink.addEventListener('click', (e) => {
            e.preventDefault();
            openModal(privacyModal);
        });
    }

    if (privacyModalClose) {
        privacyModalClose.addEventListener('click', () => closeModal(privacyModal));
    }

    if (privacyModal) {
        privacyModal.addEventListener('click', (e) => {
            if (e.target === privacyModal) {
                closeModal(privacyModal);
            }
        });
    }

    // Terms of Service Modal Events
    if (termsLink) {
        termsLink.addEventListener('click', (e) => {
            e.preventDefault();
            openModal(termsModal);
        });
    }

    if (termsModalClose) {
        termsModalClose.addEventListener('click', () => closeModal(termsModal));
    }

    if (termsModal) {
        termsModal.addEventListener('click', (e) => {
            if (e.target === termsModal) {
                closeModal(termsModal);
            }
        });
    }

    // Cookie Policy Modal Events
    if (cookieLink) {
        cookieLink.addEventListener('click', (e) => {
            e.preventDefault();
            openModal(cookieModal);
        });
    }

    if (cookieModalClose) {
        cookieModalClose.addEventListener('click', () => closeModal(cookieModal));
    }

    if (cookieModal) {
        cookieModal.addEventListener('click', (e) => {
            if (e.target === cookieModal) {
                closeModal(cookieModal);
            }
        });
    }

    // Close modals on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (privacyModal?.classList.contains('active')) {
                closeModal(privacyModal);
            }
            if (termsModal?.classList.contains('active')) {
                closeModal(termsModal);
            }
            if (cookieModal?.classList.contains('active')) {
                closeModal(cookieModal);
            }
        }
    });
});
