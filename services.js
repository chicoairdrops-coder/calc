const service_app = angular.module('miningApp');

service_app.factory('retryInterceptor', function($q, $injector, $timeout) {
    const retryLimit = 2;
    const retryDelay = 1000;

    return {
        responseError: function(response) {
            const config = response.config;
            if(!config) {
                return $q.reject(response);
            }

            if (!config.retryCount) {
                config.retryCount = 0;
            }

            if (config.retryCount < retryLimit) {
                config.retryCount++;
                const $http = $injector.get('$http');
                return $timeout(function() {
                    return $http(config);
                }, retryDelay);
            }

            return $q.reject(response);
        }
    };
  });

  service_app.factory('cacheInterceptor', function($q, $injector) {
    const cacheKeyPrefix = 'http_cache_';
    const cacheDuration = 24 * 60 * 60 * 1000; // 1 dia em milissegundos

    function getCacheKey(url) {
      return cacheKeyPrefix + SparkMD5.hash(url);
    }

    function isCacheValid(cacheEntry) {
      if (!cacheEntry) return false;
      const currentTime = new Date().getTime();
      return currentTime - cacheEntry.timestamp < cacheDuration;
    }

    return {
      request: function(config) {
        const cacheKey = getCacheKey(config.url);
        const cachedResponse = JSON.parse(localStorage.getItem(cacheKey));

        if (isCacheValid(cachedResponse)) {
          config.status = 200;
          config.config = config;
          config.data = cachedResponse.data;
          cached = true;
          return $q.resolve(config);
        }
        
        return config;
      },
      response: function(response) {
        const cacheKey = getCacheKey(response.config.url);
        const cacheEntry = {
          data: response.data,
          timestamp: new Date().getTime()
        };

        localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));

        return response;
      }
    };
  });


    service_app.config(function($httpProvider) {
        $httpProvider.interceptors.push('cacheInterceptor');
        $httpProvider.interceptors.push('retryInterceptor');
    });

service_app.service('CurrencyService', ['$http', '$q', 'FirebaseService', function($http, $q, FirebaseService) {

    const current_date = new Date().toISOString().split('T')[0];

    var delay = function(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    };

    const cacheValidityDuration = 24 * 60 * 60 * 1000;

    const getCache = (cacheKey) => {
        const cacheTimestamp = localStorage.getItem(`${cacheKey}_exp`);
        if (cacheTimestamp) {
            const now = new Date().getTime();
            const age = now - cacheTimestamp;
            if (age < cacheValidityDuration) {
                return JSON.parse(localStorage.getItem(cacheKey));
            }
        }
        return null;
    };

    const setCache = (data, cacheKey) => {
        localStorage.setItem(cacheKey, JSON.stringify(data));
        localStorage.setItem(`${cacheKey}_exp`, new Date().getTime().toString());
    };

    const fetchWithRetry = async (url, retries = 3, delay = 1000) => {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await $http.get(url);
                if (response.status === 200) {
                    const result = JSON.parse(response.data.contents);
                    return result.data[0].value;
                } else {
                    throw new Error(`HTTP status ${response.status}`);
                }
            } catch (error) {
                if (i === retries - 1) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    };

    const leagues = [
        { id: "6a846d84d4be9e1aa9a15591", name: "Bronze I" },
        { id: "6a846d84d4be9e1aa9a15592", name: "Bronze II" },
        { id: "6a846d84d4be9e1aa9a15593", name: "Bronze III" },
        { id: "6a846d84d4be9e1aa9a15594", name: "Silver I" },
        { id: "6a846d84d4be9e1aa9a15595", name: "Silver II" },
        { id: "6a846d84d4be9e1aa9a15596", name: "Silver III" },
        { id: "6a846d84d4be9e1aa9a15597", name: "Gold I" },
        { id: "6a846d84d4be9e1aa9a15598", name: "Gold II" },
        { id: "6a846d84d4be9e1aa9a15599", name: "Gold III" },
        { id: "6a846d84d4be9e1aa9a1559a", name: "Platinum I" },
        { id: "6a846d84d4be9e1aa9a1559b", name: "Platinum II" },
        { id: "6a846d84d4be9e1aa9a1559c", name: "Platinum III" },
        { id: "6a846d84d4be9e1aa9a1559d", name: "Diamond I" },
        { id: "6a846d84d4be9e1aa9a1559e", name: "Diamond II" },
        { id: "6a846d84d4be9e1aa9a1559f", name: "Diamond III" },
        { id: "6a846d84d4be9e1aa9a155a0", name: "Titan I" },
        { id: "6a846d84d4be9e1aa9a155a1", name: "Titan II" },
        { id: "6a846d84d4be9e1aa9a155a2", name: "Titan III" },
        { id: "6a846d84d4be9e1aa9a155a3", name: "Emerald I" },
        { id: "6a846d84d4be9e1aa9a155a4", name: "Emerald II" },
        { id: "6a846d84d4be9e1aa9a155a5", name: "Emerald III" },
        { id: "6a846d84d4be9e1aa9a155a6", name: "Legend" }
    ];

    this.getLeagues = function() {
        return leagues;
    };

    const manualNetworkKey = leagueId => `rc_manual_network_${leagueId}`;

    this.hasManualNetworkData = function(leagueId) {
        return Boolean(localStorage.getItem(manualNetworkKey(leagueId)));
    };

    this.importManualNetworkData = function(leagueId, text) {
        let result;
        try {
            result = typeof text === 'string' ? JSON.parse(text) : text;
        } catch (_) {
            throw new Error('O texto não é um JSON válido.');
        }

        const distribution = result?.data?.power_distribution;
        if (result?.success !== true || !Array.isArray(distribution) || !distribution.length) {
            throw new Error('Este JSON não contém data.power_distribution.');
        }

        const cleanDistribution = distribution.map(item => ({
            currency: item.currency,
            total_block_power: Number(item.total_block_power),
            block_payout: Number(item.block_payout),
            last_block_duration: Number(item.last_block_duration),
            block_created: item.block_created,
            is_in_game_currency: Boolean(item.is_in_game_currency)
        }));

        if (cleanDistribution.some(item => !item.currency || !Number.isFinite(item.total_block_power) ||
            !Number.isFinite(item.block_payout) || !Number.isFinite(item.last_block_duration))) {
            throw new Error('O JSON possui valores de rede inválidos.');
        }

        localStorage.setItem(manualNetworkKey(leagueId), JSON.stringify({
            imported_at: new Date().toISOString(),
            power_distribution: cleanDistribution
        }));
        localStorage.removeItem(`rc_network_data_${leagueId}`);
        localStorage.removeItem(`rc_network_data_${leagueId}_exp`);
        return cleanDistribution.length;
    };

    this.getManualNetworkInfo = function(leagueId) {
        try {
            return JSON.parse(localStorage.getItem(manualNetworkKey(leagueId)) || 'null');
        } catch (_) {
            return null;
        }
    };

    
    var getCurrenciesPrices = async function() {
        const cache_key = 'exchange_history';
        var cached = getCache(cache_key);
        if(cached) return cached;
        const currencies =
            [
                {
                    name: 'MATIC', coingecko_id : 'matic-network'
                },
                {
                    name: 'BNB', coingecko_id : 'binancecoin'
                },
                {
                    name: 'LTC', coingecko_id : 'litecoin'
                },
                {
                    name: 'SOL', coingecko_id : 'solana'
                },
                {
                    name: 'ETH', coingecko_id : 'ethereum'
                },
                {
                    name: 'TRX', coingecko_id : 'tron'
                },
                {
                    name: 'BTC', coingecko_id : 'bitcoin'
                },
                {
                    name: 'DOGE', coingecko_id : 'dogecoin'
                },
                {
                    name: 'XRP', coingecko_id : 'ripple'
                },
                {
                    name: 'ALGO', coingecko_id: 'algorand'
                }
            ];

        return $http.get(`https://api.coingecko.com/api/v3/simple/price?ids=${currencies.map(c => c.coingecko_id).join()}&vs_currencies=usd,brl`).then(response => {
            if (response.status === 200) { 
                var result = response.data;
                currencies.forEach(c => {
                    delete Object.assign(result, {[c.name]: result[c.coingecko_id] })[c.coingecko_id];
                })
                setCache(result, cache_key);
                return result;
            }
        });
    };

    var getCurrencies = function() {
        return $http.get(`https://wminer-calculator-proxy.chicohs.workers.dev/?${encodeURIComponent('https://rollercoin.com/api/wallet/get-currencies-config')}`).then(response => {
            if (response.status === 200) { 
                const result = response.data;
                return result.data.currencies_config.filter(c => c.is_can_be_mined).map(c => ({
                    name: c.name,
                    in_game_only: c.network === '' || c.network === 'Rollertoken',
                    balance_key: c.balance_key,
                    to_small: c.to_small,
                    divider: c.divider,
                    disabled_withdraw: c.disabled_withdraw,
                    min_to_withdraw: c.min,
                    image: `https://rollercoin.com/static/img/icon/currencies/${c.img}.svg?v=1.0`
                }));
            }
        });
    };

    this.getCurrencies = getCurrencies;
    this.getCurrenciesPrices = getCurrenciesPrices;

    this.getDetailedCurrenciesByLeague = async function(league) {
        const cache_key = `rc_network_data_${league}`;
        var cached = getCache(cache_key);
        if(cached) return cached;
        const currencies = await getCurrencies();
        const manualData = this.getManualNetworkInfo(league);
        if (!manualData?.power_distribution?.length) {
            return [];
        }
        const detailedCurrencies = [];
        for (const currency of currencies) {
            const expectedName = currency.name === 'BTC' ? 'SAT' : currency.name;
            const network = manualData.power_distribution.find(item =>
                item.currency === expectedName || item.currency === `${expectedName}_SMALL`
            );
            if (!network) continue;
            currency.blockSize = (network.block_payout / currency.divider) / currency.to_small;
            currency.networkPower = network.total_block_power;
            currency.blockTime = network.last_block_duration;
            currency.networkUnit = 'GH/s';
            detailedCurrencies.push(currency);
        }
        setCache(detailedCurrencies, cache_key);
        FirebaseService.persistNetworkPower(detailedCurrencies);
        return detailedCurrencies;
    };

}]);
