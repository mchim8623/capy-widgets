// =========================================================================
// 动漫花园随机推荐组件（TMDB 增强版，优化超时）
// =========================================================================

var WidgetMetadata = {
    id: "dmhy_random_tmdb",
    title: "动漫花园随机推荐",
    description: "随机推荐动漫花园资源（此版本为demo阶段，有问题请反馈）",
    author: "刺猬兽",
    version: "2.1.5-beta",
    site: "https://t.me/herissmon",
    modules: [
        {
            title: "随机推荐",
            functionName: "getRandomRecommend",
            type: "media_list",
            cacheDuration: 300,
            params: []
        }
    ]
};

// API 基础地址
var API_BASE = "https://dmhy.myheartsite.com/api/acg";

// 内存缓存，避免同一作品重复请求 TMDB（单次执行内有效）
var tmdbCache = {};

// =========================================================================
// 工具函数
// =========================================================================

function safeJson(data) {
    if (typeof data === "string") {
        try {
            return JSON.parse(data);
        } catch (e) {
            return {};
        }
    }
    return data || {};
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function toFormUrlEncoded(obj) {
    var parts = [];
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            var value = obj[key];
            if (value !== undefined && value !== null) {
                parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
            }
        }
    }
    return parts.join("&");
}

function cleanTitle(rawTitle) {
    if (!rawTitle) return "";
    var cleaned = rawTitle.replace(/\[[^\]]*\]/g, "").trim();
    if (cleaned.includes("/")) {
        cleaned = cleaned.split("/")[0].trim();
    }
    cleaned = cleaned.replace(/\s*-\s*\d+\s*\[.*\]/, "").trim();
    cleaned = cleaned.replace(/\s*第[一二三四五六七八九十\d]+[季期]\s*/g, "").trim();
    cleaned = cleaned.replace(/\s*\[[^\]]*\]\s*$/, "").trim();
    cleaned = cleaned.replace(/\s*\/\s*.*$/, "").trim();
    return cleaned || rawTitle;
}

/**
 * TMDB 搜索（带超时保护）
 */
async function searchTmdbAnime(query, yearHint) {
    if (!query) return null;
    var cacheKey = query + (yearHint ? "_" + yearHint : "");
    if (tmdbCache[cacheKey] !== undefined) {
        return tmdbCache[cacheKey];
    }

    var cleanQuery = query.trim();
    var result = null;

    // 搜索 TV
    try {
        var tvParams = {
            query: cleanQuery,
            language: "zh-CN",
            include_adult: false
        };
        if (yearHint) tvParams.first_air_date_year = yearHint;

        // 使用 Promise.race 加超时，避免单个请求卡太久
        var tvPromise = Widget.tmdb.get("/search/tv", { params: tvParams });
        var timeoutPromise = new Promise(function(_, reject) {
            setTimeout(function() { reject(new Error("TMDB TV timeout")); }, 8000);
        });
        var res = await Promise.race([tvPromise, timeoutPromise]);
        var candidates = res.results || [];

        if (candidates.length === 0 && yearHint) {
            delete tvParams.first_air_date_year;
            tvPromise = Widget.tmdb.get("/search/tv", { params: tvParams });
            timeoutPromise = new Promise(function(_, reject) {
                setTimeout(function() { reject(new Error("TMDB TV timeout")); }, 8000);
            });
            res = await Promise.race([tvPromise, timeoutPromise]);
            candidates = res.results || [];
        }

        var animeTVs = candidates.filter(function(r) { return r.genre_ids && r.genre_ids.indexOf(16) !== -1; });
        if (animeTVs.length > 0) {
            result = animeTVs.find(function(r) { return r.poster_path; }) || animeTVs[0];
        }
    } catch (e) {
        console.warn("TMDB TV 搜索失败", query, e);
    }

    // 如果没找到，搜索电影
    if (!result) {
        try {
            var movieParams = {
                query: cleanQuery,
                language: "zh-CN",
                include_adult: false
            };
            if (yearHint) movieParams.primary_release_year = yearHint;

            var moviePromise = Widget.tmdb.get("/search/movie", { params: movieParams });
            var timeoutPromise = new Promise(function(_, reject) {
                setTimeout(function() { reject(new Error("TMDB Movie timeout")); }, 8000);
            });
            var res = await Promise.race([moviePromise, timeoutPromise]);
            var candidates = res.results || [];

            if (candidates.length === 0 && yearHint) {
                delete movieParams.primary_release_year;
                moviePromise = Widget.tmdb.get("/search/movie", { params: movieParams });
                timeoutPromise = new Promise(function(_, reject) {
                    setTimeout(function() { reject(new Error("TMDB Movie timeout")); }, 8000);
                });
                res = await Promise.race([moviePromise, timeoutPromise]);
                candidates = res.results || [];
            }

            var animeMovies = candidates.filter(function(r) { return r.genre_ids && r.genre_ids.indexOf(16) !== -1; });
            if (animeMovies.length > 0) {
                result = animeMovies.find(function(r) { return r.poster_path; }) || animeMovies[0];
            }
        } catch (e) {
            console.warn("TMDB Movie 搜索失败", query, e);
        }
    }

    tmdbCache[cacheKey] = result;
    return result;
}

function enrichWithTmdb(item, tmdbData) {
    if (!tmdbData) return item;
    var mediaType = tmdbData.title ? "movie" : "tv";
    var title = tmdbData.name || tmdbData.title || item.title;
    var year = (tmdbData.first_air_date || tmdbData.release_date || "").substring(0, 4);
    var description = tmdbData.overview || item.description;
    var rating = tmdbData.vote_average ? tmdbData.vote_average.toFixed(1) : null;
    return {
        id: item.id,
        title: title,
        description: description,
        link: item.link,
        posterUrl: tmdbData.poster_path ? "https://image.tmdb.org/t/p/w500" + tmdbData.poster_path : null,
        backdropUrl: tmdbData.backdrop_path ? "https://image.tmdb.org/t/p/w780" + tmdbData.backdrop_path : null,
        rating: rating,
        year: year,
        mediaType: mediaType
    };
}

// =========================================================================
// 动漫花园 API 调用
// =========================================================================

async function searchAnime(keyword, page) {
    var url = API_BASE + "/search";
    var body = {
        keyword: keyword,
        page: page,
        searchType: "0",
        serverType: "server1"
    };
    var formBody = toFormUrlEncoded(body);

    var resp = await Widget.http.post(url, formBody, {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36"
        }
    });

    if (!resp.ok) {
        throw new Error("HTTP " + resp.status);
    }
    var json = safeJson(resp.data);
    if (json.code !== 1) {
        throw new Error(json.msg || "请求失败");
    }
    return json.data;
}

// =========================================================================
// 核心模块函数
// =========================================================================

async function getRandomRecommend(params) {
    // 清空缓存（每次执行新缓存）
    tmdbCache = {};
    try {
        // 1. 获取总页数
        var firstData = await searchAnime("", 1);
        var totalNum = firstData.totalNum || 0;
        var pageSize = (firstData.searchData && firstData.searchData.length) || 20;
        var totalPages = Math.ceil(totalNum / pageSize);
        if (totalPages <= 0) {
            console.warn("动漫花园没有数据");
            return [];
        }

        // 2. 随机选页
        var randomPage = randomInt(1, totalPages);
        var randomData = await searchAnime("", randomPage);
        var list = randomData.searchData || [];
        if (!list.length) return [];

        // 3. 随机打乱
        for (var i = list.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = list[i];
            list[i] = list[j];
            list[j] = temp;
        }

        // 限制最多 15 条，减少请求数
        var MAX_ITEMS = 15;
        var limited = list.slice(0, MAX_ITEMS);

        // 4. 为每个条目清洗标题并请求 TMDB（并发数 2，避免过载）
        var enrichedItems = [];
        var concurrency = 2;
        for (var idx = 0; idx < limited.length; idx += concurrency) {
            var chunk = limited.slice(idx, idx + concurrency);
            var promises = chunk.map(async function(item) {
                try {
                    var rawTitle = item.title || "";
                    var cleanName = cleanTitle(rawTitle);
                    var year = null;
                    var yearMatch = rawTitle.match(/(19|20)\d{2}/);
                    if (yearMatch) year = yearMatch[0];

                    var tmdbData = await searchTmdbAnime(cleanName, year);
                    var mediaItem = {
                        id: String(item.id),
                        title: rawTitle,
                        description: "大小: " + (item.size || "未知") + " | 发布组: " + (item.group || "未知"),
                        link: item.link,
                        posterUrl: null,
                        backdropUrl: null,
                        rating: null,
                        year: null,
                        mediaType: "movie"
                    };
                    if (tmdbData) {
                        mediaItem = enrichWithTmdb(mediaItem, tmdbData);
                    }
                    return mediaItem;
                } catch (err) {
                    console.error("处理条目 " + item.id + " 失败:", err);
                    return {
                        id: String(item.id),
                        title: item.title || "无标题",
                        description: "大小: " + (item.size || "未知") + " | 发布组: " + (item.group || "未知"),
                        link: item.link,
                        posterUrl: null,
                        backdropUrl: null,
                        rating: null,
                        year: null,
                        mediaType: "movie"
                    };
                }
            });
            var results = await Promise.all(promises);
            enrichedItems.push.apply(enrichedItems, results);
            // 批次间延迟，避免 TMDB 限流
            if (idx + concurrency < limited.length) {
                await new Promise(function(resolve) { setTimeout(resolve, 300); });
            }
        }
        return enrichedItems;
    } catch (err) {
        console.error("随机推荐失败", err);
        return [];
    }
}

// =========================================================================
// 详情获取（磁力链接）
// =========================================================================

async function loadDetail(link) {
    if (!link) {
        return { videoUrl: null };
    }

    var idMatch = link.match(/\/view\/(\d+)_/);
    if (!idMatch) {
        console.error("无法从链接解析ID:", link);
        return { videoUrl: null };
    }

    var id = idMatch[1];
    var url = API_BASE + "/detail";
    var body = {
        link: link,
        id: id
    };

    try {
        var resp = await Widget.http.post(url, body, {
            headers: { "Content-Type": "application/json" }
        });
        if (!resp.ok) {
            throw new Error("HTTP " + resp.status);
        }
        var json = safeJson(resp.data);
        if (json.code !== 1) {
            throw new Error(json.msg || "获取详情失败");
        }
        var data = json.data;
        var magnet = data.magnetLink2 || data.magnetLink1;
        if (!magnet) {
            return { videoUrl: null };
        }
        return { videoUrl: magnet };
    } catch (err) {
        console.error("获取磁力链接失败", err);
        return { videoUrl: null };
    }
}
