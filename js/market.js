/**
 * market.js - Real-time Korean Stock Market Data
 * Provides KOSPI, KOSDAQ indices, major stocks, and exchange rates
 */

const Market = (function() {
    'use strict';

    // ============================================
    // Configuration
    // ============================================
    const CONFIG = {
        updateInterval: 7000,           // 7 seconds polling
        retryDelay: 3000,               // 3 seconds retry
        maxRetries: 3,
        cacheKey: 'market_cache_v1',
        cacheTTL: 5 * 60 * 1000,        // 5 minutes cache
        animationDuration: 500,
        corsProxies: [
            'https://api.allorigins.win/raw?url=',
            'https://corsproxy.io/?',
        ]
    };

    // ============================================
    // State
    // ============================================
    let state = {
        isConnected: false,
        isMarketOpen: false,
        lastUpdate: null,
        retryCount: 0,
        pollTimer: null,
        exchangePollTimer: null,  // 환율 전용 24시간 폴링
        previousData: {},
        previousExchange: {},     // 환율 이전 데이터 (변동률 계산용)
        subscribers: []
    };

    // ============================================
    // Utility Functions
    // ============================================
    
    /**
     * Format number with Korean style (commas)
     */
    function formatNumber(num, decimals = 0) {
        if (num === null || num === undefined || isNaN(num)) return '-';
        return Number(num).toLocaleString('ko-KR', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    }

    /**
     * Format percentage with sign
     */
    function formatPercent(num) {
        if (num === null || num === undefined || isNaN(num)) return '-';
        const sign = num > 0 ? '+' : '';
        return `${sign}${num.toFixed(2)}%`;
    }

    /**
     * Format change value with sign
     */
    function formatChange(num, decimals = 2) {
        if (num === null || num === undefined || isNaN(num)) return '-';
        const sign = num > 0 ? '+' : '';
        return `${sign}${formatNumber(num, decimals)}`;
    }

    /**
     * Get relative time string
     */
    function getRelativeTime(date) {
        if (!date) return '-';
        const now = new Date();
        const diff = Math.floor((now - date) / 1000);
        
        if (diff < 5) return '방금 전';
        if (diff < 60) return `${diff}초 전`;
        if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
        return `${Math.floor(diff / 86400)}일 전`;
    }

    /**
     * Check if Korean market is open
     * Market hours: 09:00 - 15:30 KST, Mon-Fri
     */
    function isMarketOpen() {
        const now = new Date();
        const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
        const day = kst.getDay();
        const hours = kst.getHours();
        const minutes = kst.getMinutes();
        const timeNum = hours * 100 + minutes;
        
        // Weekend check
        if (day === 0 || day === 6) return false;
        
        // Market hours: 09:00 - 15:30
        return timeNum >= 900 && timeNum <= 1530;
    }

    /**
     * Get CSS class for price change (Korean style)
     */
    function getChangeClass(change) {
        if (change > 0) return 'positive';  // Red in Korean markets
        if (change < 0) return 'negative';  // Blue in Korean markets
        return 'neutral';
    }

    // ============================================
    // Cache Management
    // ============================================
    
    function saveToCache(data) {
        try {
            const cacheData = {
                timestamp: Date.now(),
                data: data
            };
            localStorage.setItem(CONFIG.cacheKey, JSON.stringify(cacheData));
        } catch (e) {
            console.warn('Cache save failed:', e);
        }
    }

    function loadFromCache() {
        try {
            const cached = localStorage.getItem(CONFIG.cacheKey);
            if (!cached) return null;
            
            const { timestamp, data } = JSON.parse(cached);
            if (Date.now() - timestamp > CONFIG.cacheTTL) {
                localStorage.removeItem(CONFIG.cacheKey);
                return null;
            }
            return data;
        } catch (e) {
            console.warn('Cache load failed:', e);
            return null;
        }
    }

    // ============================================
    // Fetch Helpers
    // ============================================
    
    async function fetchWithCORS(url, options = {}) {
        // Try direct fetch first
        try {
            const response = await fetch(url, {
                ...options,
                mode: 'cors',
                signal: AbortSignal.timeout(5000)
            });
            if (response.ok) return response;
        } catch (e) {
            // Direct fetch failed, try proxies
        }

        // Try CORS proxies
        for (const proxy of CONFIG.corsProxies) {
            try {
                const response = await fetch(proxy + encodeURIComponent(url), {
                    signal: AbortSignal.timeout(8000)
                });
                if (response.ok) return response;
            } catch (e) {
                continue;
            }
        }
        
        throw new Error('All fetch attempts failed');
    }

    // ============================================
    // Data Fetching Functions
    // ============================================

    /**
     * Fetch KOSPI index data
     * Uses simulation with realistic data when APIs unavailable
     */
    async function fetchKOSPI() {
        try {
            // Try to fetch from Yahoo Finance (free, public)
            const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EKS11?interval=1d&range=1d';
            const response = await fetchWithCORS(url);
            const data = await response.json();
            
            const result = data.chart.result[0];
            const meta = result.meta;
            const quote = result.indicators.quote[0];
            
            const current = meta.regularMarketPrice;
            const prevClose = meta.previousClose || meta.chartPreviousClose;
            const change = current - prevClose;
            const changePercent = (change / prevClose) * 100;
            
            return {
                name: 'KOSPI',
                value: current,
                change: change,
                changePercent: changePercent,
                high: Math.max(...(quote.high || [current])),
                low: Math.min(...(quote.low || [current])),
                volume: quote.volume ? quote.volume[quote.volume.length - 1] : 0,
                source: 'yahoo'
            };
        } catch (e) {
            console.warn('KOSPI fetch failed, using simulation:', e.message);
            return simulateKOSPI();
        }
    }

    /**
     * Fetch KOSDAQ index data
     */
    async function fetchKOSDAQ() {
        try {
            const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EKQ11?interval=1d&range=1d';
            const response = await fetchWithCORS(url);
            const data = await response.json();
            
            const result = data.chart.result[0];
            const meta = result.meta;
            
            const current = meta.regularMarketPrice;
            const prevClose = meta.previousClose || meta.chartPreviousClose;
            const change = current - prevClose;
            const changePercent = (change / prevClose) * 100;
            
            return {
                name: 'KOSDAQ',
                value: current,
                change: change,
                changePercent: changePercent,
                source: 'yahoo'
            };
        } catch (e) {
            console.warn('KOSDAQ fetch failed, using simulation:', e.message);
            return simulateKOSDAQ();
        }
    }

    /**
     * Fetch major Korean stocks
     */
    async function fetchMajorStocks() {
        const symbols = [
            { symbol: '005930.KS', name: '삼성전자' },
            { symbol: '000660.KS', name: 'SK하이닉스' },
            { symbol: '005380.KS', name: '현대차' },
            { symbol: '035420.KS', name: 'NAVER' },
            { symbol: '035720.KS', name: '카카오' },
            { symbol: '051910.KS', name: 'LG화학' }
        ];

        const stocks = [];
        
        for (const { symbol, name } of symbols) {
            try {
                const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
                const response = await fetchWithCORS(url);
                const data = await response.json();
                
                const meta = data.chart.result[0].meta;
                const current = meta.regularMarketPrice;
                const prevClose = meta.previousClose;
                const change = current - prevClose;
                const changePercent = (change / prevClose) * 100;
                
                stocks.push({
                    symbol,
                    name,
                    price: current,
                    change,
                    changePercent,
                    source: 'yahoo'
                });
            } catch (e) {
                // Add simulated data for failed fetches
                stocks.push(simulateStock(name));
            }
        }
        
        return stocks;
    }

    /**
     * Fetch exchange rates (24시간 실시간)
     */
    async function fetchExchangeRates() {
        try {
            // Try ExchangeRate-API (free tier) - 실시간 환율
            const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
            const data = await response.json();
            
            const krw = data.rates.KRW;
            const jpy = data.rates.JPY;
            const eur = data.rates.EUR;
            const cny = data.rates.CNY;
            
            // 이전 데이터와 비교하여 변동률 계산
            const prev = state.previousExchange;
            
            const calcChange = (current, key) => {
                if (prev[key] && prev[key].rate) {
                    const change = current - prev[key].rate;
                    const changePercent = (change / prev[key].rate) * 100;
                    return { change, changePercent };
                }
                return { change: 0, changePercent: 0 };
            };
            
            const usdkrw = krw;
            const jpykrw = krw / jpy * 100;  // Per 100 JPY
            const eurkrw = krw / eur;
            const cnykrw = krw / cny;
            
            const result = {
                USDKRW: {
                    rate: usdkrw,
                    ...calcChange(usdkrw, 'USDKRW'),
                    source: 'exchangerate-api'
                },
                JPYKRW: {
                    rate: jpykrw,
                    ...calcChange(jpykrw, 'JPYKRW'),
                    source: 'exchangerate-api'
                },
                EURKRW: {
                    rate: eurkrw,
                    ...calcChange(eurkrw, 'EURKRW'),
                    source: 'exchangerate-api'
                },
                CNYKRW: {
                    rate: cnykrw,
                    ...calcChange(cnykrw, 'CNYKRW'),
                    source: 'exchangerate-api'
                }
            };
            
            // 이전 데이터 저장
            state.previousExchange = result;
            
            return result;
        } catch (e) {
            console.warn('Exchange rate fetch failed, using simulation:', e.message);
            return simulateExchangeRates();
        }
    }
    
    /**
     * 환율 전용 폴링 (24시간, 5초마다)
     */
    async function fetchAndUpdateExchange() {
        try {
            const exchange = await fetchExchangeRates();
            updateExchangeUI(exchange);
            state.lastUpdate = new Date();
            updateTimestamp();
            
            // DOM에 직접 업데이트
            const updateEl = document.getElementById('last-update');
            if (updateEl) {
                updateEl.textContent = new Date().toLocaleTimeString('ko-KR', { hour12: false });
            }
        } catch (e) {
            console.warn('Exchange update failed:', e.message);
        }
    }
    
    /**
     * 환율 24시간 폴링 시작
     */
    function startExchangePolling() {
        if (state.exchangePollTimer) {
            clearInterval(state.exchangePollTimer);
        }
        
        // 초기 fetch
        fetchAndUpdateExchange();
        
        // 5초마다 환율 업데이트 (24시간)
        state.exchangePollTimer = setInterval(fetchAndUpdateExchange, 5000);
        console.log('💱 Exchange rate 24h polling started (5s interval)');
    }
    
    /**
     * 환율 폴링 중지
     */
    function stopExchangePolling() {
        if (state.exchangePollTimer) {
            clearInterval(state.exchangePollTimer);
            state.exchangePollTimer = null;
        }
    }

    // ============================================
    // Simulation Functions (Fallback)
    // ============================================
    
    function getRandomVariation(base, maxPercent = 0.5) {
        const variation = (Math.random() - 0.5) * 2 * (base * maxPercent / 100);
        return variation;
    }

    function simulateKOSPI() {
        const baseValue = state.previousData.kospi?.value || 2650;
        const variation = getRandomVariation(baseValue, 0.3);
        const newValue = baseValue + variation;
        const prevClose = state.previousData.kospi?.prevClose || 2640;
        
        return {
            name: 'KOSPI',
            value: newValue,
            change: newValue - prevClose,
            changePercent: ((newValue - prevClose) / prevClose) * 100,
            prevClose: prevClose,
            source: 'simulated'
        };
    }

    function simulateKOSDAQ() {
        const baseValue = state.previousData.kosdaq?.value || 850;
        const variation = getRandomVariation(baseValue, 0.4);
        const newValue = baseValue + variation;
        const prevClose = state.previousData.kosdaq?.prevClose || 845;
        
        return {
            name: 'KOSDAQ',
            value: newValue,
            change: newValue - prevClose,
            changePercent: ((newValue - prevClose) / prevClose) * 100,
            prevClose: prevClose,
            source: 'simulated'
        };
    }

    function simulateStock(name) {
        const baseValues = {
            '삼성전자': 72000,
            'SK하이닉스': 185000,
            '현대차': 245000,
            'NAVER': 195000,
            '카카오': 42000,
            'LG화학': 380000
        };
        
        const base = baseValues[name] || 50000;
        const variation = getRandomVariation(base, 1.5);
        const price = base + variation;
        const prevClose = base * 0.995;
        
        return {
            name,
            price,
            change: price - prevClose,
            changePercent: ((price - prevClose) / prevClose) * 100,
            source: 'simulated'
        };
    }

    function simulateExchangeRates() {
        return {
            USDKRW: {
                rate: 1380 + getRandomVariation(1380, 0.2),
                change: getRandomVariation(1380, 0.1),
                changePercent: (Math.random() - 0.5) * 0.5,
                source: 'simulated'
            },
            JPYKRW: {
                rate: 920 + getRandomVariation(920, 0.2),
                change: getRandomVariation(920, 0.1),
                changePercent: (Math.random() - 0.5) * 0.5,
                source: 'simulated'
            },
            EURKRW: {
                rate: 1490 + getRandomVariation(1490, 0.2),
                change: getRandomVariation(1490, 0.1),
                changePercent: (Math.random() - 0.5) * 0.5,
                source: 'simulated'
            }
        };
    }

    // ============================================
    // UI Update Functions
    // ============================================
    
    /**
     * Animate number transition
     */
    function animateValue(element, start, end, duration = CONFIG.animationDuration) {
        if (!element || start === end) return;
        
        const startTime = performance.now();
        const decimals = String(end).includes('.') ? 2 : 0;
        
        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing function
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = start + (end - start) * eased;
            
            element.textContent = formatNumber(current, decimals);
            
            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }
        
        requestAnimationFrame(update);
    }

    /**
     * Apply flash effect on price change
     */
    function flashElement(element, direction) {
        if (!element) return;
        
        element.classList.remove('flash-up', 'flash-down');
        void element.offsetWidth; // Force reflow
        element.classList.add(direction > 0 ? 'flash-up' : 'flash-down');
        
        setTimeout(() => {
            element.classList.remove('flash-up', 'flash-down');
        }, 600);
    }

    /**
     * Update connection status indicator
     */
    function updateConnectionStatus(connected) {
        const indicator = document.querySelector('.connection-status');
        if (indicator) {
            indicator.classList.toggle('connected', connected);
            indicator.classList.toggle('disconnected', !connected);
            indicator.setAttribute('title', connected ? '연결됨' : '연결 끊김');
        }
    }

    /**
     * Update market status
     */
    function updateMarketStatus() {
        const open = isMarketOpen();
        const statusEl = document.querySelector('.market-status');
        if (statusEl) {
            statusEl.textContent = open ? '장중' : '장마감';
            statusEl.classList.toggle('open', open);
            statusEl.classList.toggle('closed', !open);
        }
        state.isMarketOpen = open;
    }

    /**
     * Update index display (KOSPI/KOSDAQ)
     */
    function updateIndexUI(selector, data) {
        const container = document.querySelector(selector);
        if (!container || !data) return;

        const valueEl = container.querySelector('.index-value');
        const changeEl = container.querySelector('.index-change');
        const percentEl = container.querySelector('.index-percent');

        if (valueEl) {
            const oldValue = parseFloat(valueEl.dataset.value) || data.value;
            if (oldValue !== data.value) {
                animateValue(valueEl, oldValue, data.value);
                flashElement(valueEl.closest('.index-card'), data.change);
            } else {
                valueEl.textContent = formatNumber(data.value, 2);
            }
            valueEl.dataset.value = data.value;
        }

        if (changeEl) {
            changeEl.textContent = formatChange(data.change, 2);
            changeEl.className = `index-change ${getChangeClass(data.change)}`;
        }

        if (percentEl) {
            percentEl.textContent = formatPercent(data.changePercent);
            percentEl.className = `index-percent ${getChangeClass(data.changePercent)}`;
        }
    }

    /**
     * Update stocks list
     */
    function updateStocksUI(stocks) {
        const container = document.querySelector('.stocks-list');
        if (!container || !stocks) return;

        stocks.forEach((stock, index) => {
            let row = container.querySelector(`[data-stock-index="${index}"]`);
            
            if (!row) {
                row = document.createElement('div');
                row.className = 'stock-row';
                row.dataset.stockIndex = index;
                row.innerHTML = `
                    <span class="stock-name">${stock.name}</span>
                    <span class="stock-price"></span>
                    <span class="stock-change"></span>
                `;
                container.appendChild(row);
            }

            const priceEl = row.querySelector('.stock-price');
            const changeEl = row.querySelector('.stock-change');

            if (priceEl) {
                const oldPrice = parseFloat(priceEl.dataset.price) || stock.price;
                if (oldPrice !== stock.price) {
                    animateValue(priceEl, oldPrice, stock.price);
                    flashElement(row, stock.change);
                } else {
                    priceEl.textContent = formatNumber(stock.price);
                }
                priceEl.dataset.price = stock.price;
            }

            if (changeEl) {
                changeEl.textContent = formatPercent(stock.changePercent);
                changeEl.className = `stock-change ${getChangeClass(stock.changePercent)}`;
            }
        });
    }

    /**
     * Update exchange rates UI
     */
    function updateExchangeUI(rates) {
        if (!rates) return;

        Object.entries(rates).forEach(([key, data]) => {
            const container = document.querySelector(`[data-currency="${key}"]`);
            if (!container) return;

            const rateEl = container.querySelector('.rate-value');
            const changeEl = container.querySelector('.rate-change');

            if (rateEl) {
                rateEl.textContent = formatNumber(data.rate, 2);
            }

            if (changeEl && data.changePercent !== 0) {
                changeEl.textContent = formatPercent(data.changePercent);
                changeEl.className = `rate-change ${getChangeClass(data.changePercent)}`;
            }
        });
    }

    /**
     * Update last update time
     */
    function updateTimestamp() {
        const el = document.querySelector('.last-update');
        if (el && state.lastUpdate) {
            el.textContent = getRelativeTime(state.lastUpdate);
        }
    }

    /**
     * Main UI update function
     */
    function updateUI(data) {
        if (!data) return;

        updateMarketStatus();
        updateConnectionStatus(state.isConnected);

        if (data.kospi) {
            updateIndexUI('.kospi-container', data.kospi);
        }

        if (data.kosdaq) {
            updateIndexUI('.kosdaq-container', data.kosdaq);
        }

        if (data.stocks) {
            updateStocksUI(data.stocks);
        }

        if (data.exchange) {
            updateExchangeUI(data.exchange);
        }

        updateTimestamp();

        // Notify subscribers
        state.subscribers.forEach(callback => {
            try {
                callback(data);
            } catch (e) {
                console.error('Subscriber callback error:', e);
            }
        });
    }

    // ============================================
    // Main Fetch & Polling
    // ============================================

    /**
     * Fetch all market data
     */
    async function fetchAllData() {
        try {
            const [kospi, kosdaq, stocks, exchange] = await Promise.allSettled([
                fetchKOSPI(),
                fetchKOSDAQ(),
                fetchMajorStocks(),
                fetchExchangeRates()
            ]);

            const data = {
                kospi: kospi.status === 'fulfilled' ? kospi.value : simulateKOSPI(),
                kosdaq: kosdaq.status === 'fulfilled' ? kosdaq.value : simulateKOSDAQ(),
                stocks: stocks.status === 'fulfilled' ? stocks.value : [],
                exchange: exchange.status === 'fulfilled' ? exchange.value : simulateExchangeRates(),
                timestamp: new Date()
            };

            // Update state
            state.previousData = {
                kospi: data.kospi,
                kosdaq: data.kosdaq
            };
            state.lastUpdate = data.timestamp;
            state.isConnected = true;
            state.retryCount = 0;

            // Cache data
            saveToCache(data);

            return data;
        } catch (error) {
            console.error('Data fetch failed:', error);
            state.isConnected = false;
            state.retryCount++;

            // Return cached data if available
            const cached = loadFromCache();
            if (cached) {
                cached.fromCache = true;
                return cached;
            }

            throw error;
        }
    }

    /**
     * Start polling for updates
     */
    function startPolling() {
        if (state.pollTimer) {
            clearInterval(state.pollTimer);
        }

        // Initial fetch
        fetchAndUpdate();

        // Set up polling
        state.pollTimer = setInterval(async () => {
            await fetchAndUpdate();
        }, CONFIG.updateInterval);

        // Update relative time every minute
        setInterval(updateTimestamp, 60000);
    }

    /**
     * Fetch data and update UI
     */
    async function fetchAndUpdate() {
        try {
            const data = await fetchAllData();
            updateUI(data);
        } catch (error) {
            console.error('Update failed:', error);
            updateConnectionStatus(false);

            // Retry logic
            if (state.retryCount < CONFIG.maxRetries) {
                console.log(`Retrying in ${CONFIG.retryDelay}ms... (attempt ${state.retryCount + 1})`);
                setTimeout(fetchAndUpdate, CONFIG.retryDelay);
            }
        }
    }

    /**
     * Stop polling
     */
    function stopPolling() {
        if (state.pollTimer) {
            clearInterval(state.pollTimer);
            state.pollTimer = null;
        }
    }

    // ============================================
    // Public API
    // ============================================

    /**
     * Initialize market data module
     */
    async function initMarket(options = {}) {
        console.log('📈 Market module initializing...');

        // Merge options
        Object.assign(CONFIG, options);

        // Try to load cached data first for instant display
        const cached = loadFromCache();
        if (cached) {
            console.log('📦 Loading cached data...');
            updateUI(cached);
        }

        // Start real-time polling (주식: 장 시간만)
        startPolling();
        
        // Start exchange rate polling (환율: 24시간)
        startExchangePolling();

        // Handle visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                stopPolling();
                stopExchangePolling();
            } else {
                startPolling();
                startExchangePolling();
            }
        });

        console.log('✅ Market module initialized (주식 + 환율 24h)');

        return {
            refresh: fetchAndUpdate,
            stop: stopPolling,
            start: startPolling,
            getData: () => state.previousData,
            subscribe: (callback) => {
                state.subscribers.push(callback);
                return () => {
                    state.subscribers = state.subscribers.filter(cb => cb !== callback);
                };
            }
        };
    }

    // ============================================
    // CSS Styles (injected if not present)
    // ============================================
    
    function injectStyles() {
        if (document.getElementById('market-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'market-styles';
        styles.textContent = `
            /* Korean market colors: positive=red, negative=blue */
            .positive { color: #e53935 !important; }
            .negative { color: #1e88e5 !important; }
            .neutral { color: #757575; }
            
            /* Flash animations */
            @keyframes flashUp {
                0%, 100% { background-color: transparent; }
                50% { background-color: rgba(229, 57, 53, 0.2); }
            }
            @keyframes flashDown {
                0%, 100% { background-color: transparent; }
                50% { background-color: rgba(30, 136, 229, 0.2); }
            }
            .flash-up { animation: flashUp 0.6s ease-out; }
            .flash-down { animation: flashDown 0.6s ease-out; }
            
            /* Connection status */
            .connection-status {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                display: inline-block;
            }
            .connection-status.connected { background-color: #4caf50; }
            .connection-status.disconnected { background-color: #f44336; }
            
            /* Market status */
            .market-status.open { color: #4caf50; }
            .market-status.closed { color: #9e9e9e; }
        `;
        document.head.appendChild(styles);
    }

    // Inject styles on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectStyles);
    } else {
        injectStyles();
    }

    // ============================================
    // Exports
    // ============================================

    return {
        init: initMarket,
        formatNumber,
        formatPercent,
        formatChange,
        getRelativeTime,
        isMarketOpen,
        getChangeClass
    };

})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Market;
}

// Auto-init if data attribute present
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('[data-market-auto-init]')) {
        Market.init();
    }
});
