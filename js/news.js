/**
 * news.js - Korean Financial News Feed Module
 * Fetches news from RSS feeds with CORS proxy fallback
 */

const NewsModule = (function() {
    'use strict';

    // Configuration
    const CONFIG = {
        refreshInterval: 5 * 60 * 1000, // 5 minutes
        cacheKey: 'financeNews_cache',
        cacheExpiry: 30 * 60 * 1000, // 30 minutes
        maxRetries: 3,
        retryDelay: 2000
    };

    // CORS proxies to try (in order)
    const CORS_PROXIES = [
        'https://api.allorigins.win/raw?url=',
        'https://corsproxy.io/?',
        'https://api.codetabs.com/v1/proxy?quest='
    ];

    // RSS Feed sources by category
    const RSS_SOURCES = {
        '증시': [
            { name: '연합뉴스 증권', url: 'https://www.yna.co.kr/rss/stock.xml' },
            { name: '한경 증권', url: 'https://www.hankyung.com/feed/stock' }
        ],
        '환율': [
            { name: '연합뉴스 경제', url: 'https://www.yna.co.kr/rss/economy.xml' }
        ],
        '기업': [
            { name: '연합뉴스 기업', url: 'https://www.yna.co.kr/rss/industry.xml' },
            { name: '한경 기업', url: 'https://www.hankyung.com/feed/industry' }
        ],
        '글로벌': [
            { name: '연합뉴스 국제', url: 'https://www.yna.co.kr/rss/international.xml' },
            { name: '한경 글로벌', url: 'https://www.hankyung.com/feed/international' }
        ],
        'all': [
            { name: '연합뉴스 경제', url: 'https://www.yna.co.kr/rss/economy.xml' },
            { name: '한경 경제', url: 'https://www.hankyung.com/feed/economy' }
        ]
    };

    // Demo/fallback news data
    const DEMO_NEWS = [
        {
            title: '코스피, 외국인 매수세에 상승 마감',
            source: '연합뉴스',
            timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
            url: '#',
            summary: '외국인 투자자들의 순매수가 이어지며 코스피 지수가 상승 마감했다.'
        },
        {
            title: '원/달러 환율, 1,300원대 초반 등락',
            source: '한국경제',
            timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
            url: '#',
            summary: '달러 강세 속에 원화가 약세를 보이며 환율이 등락을 거듭하고 있다.'
        },
        {
            title: '삼성전자, AI 반도체 신규 투자 발표',
            source: '매일경제',
            timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            url: '#',
            summary: '삼성전자가 AI 반도체 생산 확대를 위한 대규모 투자 계획을 발표했다.'
        },
        {
            title: '미 연준 금리 동결, 글로벌 증시 영향',
            source: '서울경제',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            url: '#',
            summary: '미국 연방준비제도가 기준금리를 동결하며 글로벌 금융시장에 영향을 미쳤다.'
        },
        {
            title: 'SK하이닉스, HBM 수주 호조',
            source: '연합뉴스',
            timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
            url: '#',
            summary: 'SK하이닉스의 고대역폭메모리(HBM) 수주가 예상을 상회하고 있다.'
        }
    ];

    // State
    let state = {
        currentCategory: 'all',
        articles: [],
        isLoading: false,
        lastFetch: null,
        refreshTimer: null,
        currentProxyIndex: 0
    };

    /**
     * Initialize the news module
     */
    async function initNews(containerId = 'news-container') {
        console.log('[News] Initializing news module...');
        
        // Try to load cached data first
        const cached = loadFromCache();
        if (cached) {
            state.articles = cached.articles;
            state.lastFetch = cached.timestamp;
            renderNewsCards(cached.articles, containerId);
        }

        // Fetch fresh data
        await fetchNews(state.currentCategory, containerId);

        // Set up auto-refresh
        startAutoRefresh(containerId);

        console.log('[News] News module initialized');
        return true;
    }

    /**
     * Fetch news articles by category
     */
    async function fetchNews(category = 'all', containerId = 'news-container') {
        if (state.isLoading) return state.articles;

        state.isLoading = true;
        state.currentCategory = category;
        showLoading(containerId);

        try {
            const sources = RSS_SOURCES[category] || RSS_SOURCES['all'];
            const allArticles = [];

            for (const source of sources) {
                try {
                    const articles = await fetchRSSFeed(source.url, source.name);
                    allArticles.push(...articles);
                } catch (err) {
                    console.warn(`[News] Failed to fetch from ${source.name}:`, err.message);
                }
            }

            if (allArticles.length > 0) {
                // Sort by timestamp (newest first)
                allArticles.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                
                // Remove duplicates by title
                const uniqueArticles = removeDuplicates(allArticles);
                
                state.articles = uniqueArticles;
                state.lastFetch = Date.now();
                
                // Cache successful fetch
                saveToCache(uniqueArticles);
                
                renderNewsCards(uniqueArticles, containerId);
            } else {
                throw new Error('No articles fetched');
            }

        } catch (error) {
            console.error('[News] Fetch error:', error);
            handleFetchError(containerId);
        } finally {
            state.isLoading = false;
            hideLoading(containerId);
        }

        return state.articles;
    }

    /**
     * Fetch and parse RSS feed
     */
    async function fetchRSSFeed(url, sourceName, retryCount = 0) {
        const proxyUrl = CORS_PROXIES[state.currentProxyIndex] + encodeURIComponent(url);
        
        try {
            const response = await fetch(proxyUrl, {
                headers: { 'Accept': 'application/xml, text/xml, */*' }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const text = await response.text();
            return parseRSS(text, sourceName);

        } catch (error) {
            // Try next proxy
            if (state.currentProxyIndex < CORS_PROXIES.length - 1) {
                state.currentProxyIndex++;
                return fetchRSSFeed(url, sourceName, retryCount);
            }
            
            // Retry with first proxy
            if (retryCount < CONFIG.maxRetries) {
                state.currentProxyIndex = 0;
                await delay(CONFIG.retryDelay);
                return fetchRSSFeed(url, sourceName, retryCount + 1);
            }

            throw error;
        }
    }

    /**
     * Parse RSS XML to articles
     */
    function parseRSS(xmlText, sourceName) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, 'text/xml');
        
        const parseError = doc.querySelector('parsererror');
        if (parseError) {
            throw new Error('Invalid XML');
        }

        const items = doc.querySelectorAll('item');
        const articles = [];

        items.forEach((item, index) => {
            if (index >= 10) return; // Limit to 10 per source

            const title = getElementText(item, 'title');
            const link = getElementText(item, 'link');
            const pubDate = getElementText(item, 'pubDate');
            const description = getElementText(item, 'description');
            
            // Try to extract thumbnail
            let thumbnail = null;
            const enclosure = item.querySelector('enclosure[type^="image"]');
            if (enclosure) {
                thumbnail = enclosure.getAttribute('url');
            } else {
                // Try to find image in description
                const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/);
                if (imgMatch) {
                    thumbnail = imgMatch[1];
                }
            }

            if (title && link) {
                articles.push({
                    title: cleanText(title),
                    source: sourceName,
                    timestamp: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
                    url: link,
                    thumbnail: thumbnail,
                    summary: cleanText(stripHtml(description)).slice(0, 150)
                });
            }
        });

        return articles;
    }

    /**
     * Get hot/trending news (most recent from all categories)
     */
    async function getHotNews(limit = 5) {
        if (state.articles.length === 0) {
            await fetchNews('all');
        }
        
        // Return top articles (already sorted by time)
        return state.articles.slice(0, limit);
    }

    /**
     * Render news cards to container
     */
    function renderNewsCards(articles, containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn(`[News] Container #${containerId} not found`);
            return;
        }

        if (!articles || articles.length === 0) {
            container.innerHTML = `
                <div class="news-empty">
                    <i class="fas fa-newspaper"></i>
                    <p>뉴스를 불러오는 중...</p>
                </div>
            `;
            return;
        }

        const html = articles.map(article => createNewsCard(article)).join('');
        
        // Add category filter if not exists
        let filterHtml = '';
        if (!container.querySelector('.news-filter')) {
            filterHtml = createCategoryFilter();
        }

        container.innerHTML = filterHtml + `
            <div class="news-grid">
                ${html}
            </div>
            <div class="news-footer">
                <span class="news-update-time">
                    마지막 업데이트: ${formatRelativeTime(state.lastFetch || Date.now())}
                </span>
            </div>
        `;

        // Attach filter event listeners
        attachFilterListeners(containerId);
    }

    /**
     * Create a single news card HTML
     */
    function createNewsCard(article) {
        const thumbnailHtml = article.thumbnail 
            ? `<div class="news-card-thumbnail">
                 <img src="${article.thumbnail}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'">
               </div>`
            : '';

        const summaryHtml = article.summary 
            ? `<p class="news-card-summary">${article.summary}</p>`
            : '';

        return `
            <article class="news-card" onclick="window.open('${article.url}', '_blank')">
                ${thumbnailHtml}
                <div class="news-card-content">
                    <h3 class="news-card-title">${article.title}</h3>
                    ${summaryHtml}
                    <div class="news-card-meta">
                        <span class="news-source-badge">${article.source}</span>
                        <span class="news-time">${formatRelativeTime(article.timestamp)}</span>
                    </div>
                </div>
            </article>
        `;
    }

    /**
     * Create category filter HTML
     */
    function createCategoryFilter() {
        const categories = ['all', '증시', '환율', '기업', '글로벌'];
        const labels = { 'all': '전체', '증시': '증시', '환율': '환율', '기업': '기업', '글로벌': '글로벌' };
        
        const buttons = categories.map(cat => `
            <button class="news-filter-btn ${state.currentCategory === cat ? 'active' : ''}" 
                    data-category="${cat}">
                ${labels[cat]}
            </button>
        `).join('');

        return `
            <div class="news-filter">
                ${buttons}
                <button class="news-refresh-btn" title="새로고침">
                    <i class="fas fa-sync-alt"></i>
                </button>
            </div>
        `;
    }

    /**
     * Attach event listeners to filter buttons
     */
    function attachFilterListeners(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Category filter buttons
        container.querySelectorAll('.news-filter-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const category = e.target.dataset.category;
                
                // Update active state
                container.querySelectorAll('.news-filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                await fetchNews(category, containerId);
            });
        });

        // Refresh button
        const refreshBtn = container.querySelector('.news-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.classList.add('spinning');
                await fetchNews(state.currentCategory, containerId);
                refreshBtn.classList.remove('spinning');
            });
        }
    }

    /**
     * Format timestamp to relative time (Korean)
     */
    function formatRelativeTime(timestamp) {
        const now = Date.now();
        const time = new Date(timestamp).getTime();
        const diff = Math.floor((now - time) / 1000);

        if (diff < 60) return '방금 전';
        if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
        
        return new Date(timestamp).toLocaleDateString('ko-KR');
    }

    /**
     * Show loading state
     */
    function showLoading(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Add loading overlay if grid exists
        const grid = container.querySelector('.news-grid');
        if (grid) {
            grid.classList.add('loading');
        }
    }

    /**
     * Hide loading state
     */
    function hideLoading(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const grid = container.querySelector('.news-grid');
        if (grid) {
            grid.classList.remove('loading');
        }
    }

    /**
     * Handle fetch error with fallback
     */
    function handleFetchError(containerId) {
        // Try cache first
        const cached = loadFromCache();
        if (cached && cached.articles.length > 0) {
            console.log('[News] Using cached data due to fetch error');
            state.articles = cached.articles;
            renderNewsCards(cached.articles, containerId);
            return;
        }

        // Fall back to demo data
        console.log('[News] Using demo data due to fetch error');
        state.articles = DEMO_NEWS;
        renderNewsCards(DEMO_NEWS, containerId);

        // Show error notification
        showNotification('뉴스를 불러오는데 실패했습니다. 잠시 후 다시 시도합니다.', 'warning');
    }

    /**
     * Save articles to LocalStorage cache
     */
    function saveToCache(articles) {
        try {
            const cacheData = {
                articles: articles,
                timestamp: Date.now(),
                category: state.currentCategory
            };
            localStorage.setItem(CONFIG.cacheKey, JSON.stringify(cacheData));
        } catch (e) {
            console.warn('[News] Failed to save cache:', e);
        }
    }

    /**
     * Load articles from LocalStorage cache
     */
    function loadFromCache() {
        try {
            const cached = localStorage.getItem(CONFIG.cacheKey);
            if (!cached) return null;

            const data = JSON.parse(cached);
            
            // Check if cache is expired
            if (Date.now() - data.timestamp > CONFIG.cacheExpiry) {
                localStorage.removeItem(CONFIG.cacheKey);
                return null;
            }

            return data;
        } catch (e) {
            console.warn('[News] Failed to load cache:', e);
            return null;
        }
    }

    /**
     * Start auto-refresh timer
     */
    function startAutoRefresh(containerId) {
        if (state.refreshTimer) {
            clearInterval(state.refreshTimer);
        }

        state.refreshTimer = setInterval(() => {
            console.log('[News] Auto-refreshing...');
            fetchNews(state.currentCategory, containerId);
        }, CONFIG.refreshInterval);
    }

    /**
     * Stop auto-refresh timer
     */
    function stopAutoRefresh() {
        if (state.refreshTimer) {
            clearInterval(state.refreshTimer);
            state.refreshTimer = null;
        }
    }

    // Utility functions
    function getElementText(parent, tagName) {
        const el = parent.querySelector(tagName);
        return el ? el.textContent : '';
    }

    function cleanText(text) {
        return text.replace(/\s+/g, ' ').trim();
    }

    function stripHtml(html) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }

    function removeDuplicates(articles) {
        const seen = new Set();
        return articles.filter(article => {
            const key = article.title.toLowerCase().slice(0, 50);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function showNotification(message, type = 'info') {
        // Use global notification if available
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            console.log(`[News] ${type}: ${message}`);
        }
    }

    // CSS Styles (injected once)
    function injectStyles() {
        if (document.getElementById('news-module-styles')) return;

        const styles = `
            .news-filter {
                display: flex;
                gap: 8px;
                margin-bottom: 16px;
                flex-wrap: wrap;
                align-items: center;
            }

            .news-filter-btn {
                padding: 6px 14px;
                border: 1px solid var(--border-color, #e0e0e0);
                background: var(--bg-secondary, #f5f5f5);
                border-radius: 20px;
                font-size: 13px;
                cursor: pointer;
                transition: all 0.2s ease;
                color: var(--text-secondary, #666);
            }

            .news-filter-btn:hover {
                background: var(--bg-hover, #e8e8e8);
            }

            .news-filter-btn.active {
                background: var(--primary-color, #2563eb);
                color: white;
                border-color: var(--primary-color, #2563eb);
            }

            .news-refresh-btn {
                margin-left: auto;
                padding: 8px;
                border: none;
                background: transparent;
                cursor: pointer;
                color: var(--text-secondary, #666);
                border-radius: 50%;
                transition: all 0.2s ease;
            }

            .news-refresh-btn:hover {
                background: var(--bg-hover, #e8e8e8);
            }

            .news-refresh-btn.spinning i {
                animation: spin 1s linear infinite;
            }

            @keyframes spin {
                100% { transform: rotate(360deg); }
            }

            .news-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                gap: 16px;
                transition: opacity 0.2s ease;
            }

            .news-grid.loading {
                opacity: 0.6;
                pointer-events: none;
            }

            .news-card {
                background: var(--bg-card, #ffffff);
                border: 1px solid var(--border-color, #e0e0e0);
                border-radius: 12px;
                overflow: hidden;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .news-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                border-color: var(--primary-color, #2563eb);
            }

            .news-card-thumbnail {
                width: 100%;
                height: 140px;
                overflow: hidden;
                background: var(--bg-secondary, #f5f5f5);
            }

            .news-card-thumbnail img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .news-card-content {
                padding: 14px;
            }

            .news-card-title {
                font-size: 14px;
                font-weight: 600;
                line-height: 1.4;
                margin: 0 0 8px 0;
                color: var(--text-primary, #1a1a1a);
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
            }

            .news-card-summary {
                font-size: 12px;
                color: var(--text-secondary, #666);
                line-height: 1.5;
                margin: 0 0 10px 0;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
            }

            .news-card-meta {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 11px;
            }

            .news-source-badge {
                background: var(--bg-secondary, #f0f0f0);
                color: var(--text-secondary, #666);
                padding: 3px 8px;
                border-radius: 10px;
                font-weight: 500;
            }

            .news-time {
                color: var(--text-muted, #999);
            }

            .news-footer {
                margin-top: 16px;
                padding-top: 12px;
                border-top: 1px solid var(--border-color, #e0e0e0);
                text-align: center;
            }

            .news-update-time {
                font-size: 11px;
                color: var(--text-muted, #999);
            }

            .news-empty {
                text-align: center;
                padding: 40px 20px;
                color: var(--text-muted, #999);
            }

            .news-empty i {
                font-size: 48px;
                margin-bottom: 12px;
                opacity: 0.5;
            }

            /* Dark mode support */
            @media (prefers-color-scheme: dark) {
                .news-card {
                    background: var(--bg-card, #2a2a2a);
                    border-color: var(--border-color, #404040);
                }

                .news-card-title {
                    color: var(--text-primary, #f0f0f0);
                }

                .news-filter-btn {
                    background: var(--bg-secondary, #333);
                    border-color: var(--border-color, #404040);
                    color: var(--text-secondary, #aaa);
                }
            }
        `;

        const styleEl = document.createElement('style');
        styleEl.id = 'news-module-styles';
        styleEl.textContent = styles;
        document.head.appendChild(styleEl);
    }

    // Inject styles on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectStyles);
    } else {
        injectStyles();
    }

    // Public API
    return {
        initNews,
        fetchNews,
        renderNewsCards,
        getHotNews,
        stopAutoRefresh,
        getState: () => ({ ...state }),
        setCategory: (category) => { state.currentCategory = category; }
    };
})();

// Export for ES modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NewsModule;
}

// Global export
window.NewsModule = NewsModule;
window.initNews = NewsModule.initNews;
