// =========================================================================
// 动漫花园随机推荐组件（采用严格 TMDB 映射器）
// =========================================================================

var WidgetMetadata = {
    id: "dmhy_random_tmdb",
    title: "动漫花园随机推荐",
    description: "随机推荐动漫花园资源，自动匹配 TMDB 海报与简介（此版本为demo阶段，有问题请反馈）",
    author: "刺猬兽",
    version: "2.2.0-beta",
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

// =========================================================================
// 核心工具函数与 TMDB 严格匹配器（仿照参考代码）
// =========================================================================

var GENRE_MAP = {
    16: "动画", 10759: "动作冒险", 35: "喜剧", 18: "剧情", 14: "奇幻", 
    878: "科幻", 9648: "悬疑", 10749: "爱情", 27: "恐怖", 10765: "科幻奇幻"
};

function getGenreText(ids) {
    if (!ids || !Array.isArray(ids)) return "动画";
    var genres = ids.filter(function(id) { return id !== 16; }).map(function(id) { return GENRE_MAP[id]; }).filter(Boolean);
    return genres.length > 0 ? genres.slice(0, 2).join(" / ") : "动画";
}

function parseDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return '';
    var match = dateStr.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (match) return match[1] + '-' + String(match[2]).padStart(2, '0') + '-' + String(match[3]).padStart(2, '0');
    match = dateStr.match(/^(\d{4})年(\d{1,2})月/);
    if (match) return match[1] + '-' + String(match[2]).padStart(2, '0') + '-01';
    match = dateStr.match(/^(\d{4})$/);
    if (match) return match[1] + '-01-01';
    return dateStr;
}

/**
 * 清洗动漫花园标题，提取核心作品名称
 */
function cleanTitle(rawTitle) {
    if (!rawTitle) return "";
    // 移除方括号内容
    var cleaned = rawTitle.replace(/\[[^\]]*\]/g, "").trim();
    // 取斜杠前部分
    if (cleaned.includes("/")) {
        cleaned = cleaned.split("/")[0].trim();
    }
    // 移除 "- 数字 [xxx]" 格式
    cleaned = cleaned.replace(/\s*-\s*\d+\s*\[.*\]/, "").trim();
    // 移除 "第X季/期"
    cleaned = cleaned.replace(/\s*第[一二三四五六七八九十\d]+[季期]\s*/g, "").trim();
    // 移除末尾的版本标记
    cleaned = cleaned.replace(/\s*\[[^\]]*\]\s*$/, "").trim();
    // 移除残留的斜杠及之后内容
    cleaned = cleaned.replace(/\s*\/\s*.*$/, "").trim();
    return cleaned || rawTitle;
}

/**
 * 专供动漫的 TMDB 严格映射器（仿照参考代码）
 * 只映射带有 "16(动画)" 标签的影视，且带年份降级重搜机制！
 */
async function searchTmdbAnimeStrict(title1, title2, year) {
    async function doSearch(query) {
        if (!query || typeof query !== 'string') return null;
        // 清洗季数和特殊字符，提高命中率
        var cleanQuery = query.replace(/第[一二三四五六七八九十\d]+[季章]/g, "").replace(/Season \d+/i, "").trim();
        
        try {
            // 1. 搜剧集 (TV)
            var params = { query: cleanQuery, language: "zh-CN", include_adult: false };
            if (year) params.first_air_date_year = year;
            
            var res = await Widget.tmdb.get("/search/tv", { params: params });
            var candidates = res.results || [];
            
            // 降级：如果带年份没搜到，去掉年份重搜
            if (candidates.length === 0 && year) {
                delete params.first_air_date_year;
                res = await Widget.tmdb.get("/search/tv", { params: params });
                candidates = res.results || [];
            }
            
            var animeTvs = candidates.filter(function(r) { return r.genre_ids && r.genre_ids.indexOf(16) !== -1; });
            if (animeTvs.length > 0) return animeTvs.find(function(r) { return r.poster_path; }) || animeTvs[0];

            // 2. 搜电影 (Movie - 剧场版)
            var mParams = { query: cleanQuery, language: "zh-CN", include_adult: false };
            if (year) mParams.primary_release_year = year;
            res = await Widget.tmdb.get("/search/movie", { params: mParams });
            candidates = res.results || [];

            if (candidates.length === 0 && year) {
                delete mParams.primary_release_year;
                res = await Widget.tmdb.get("/search/movie", { params: mParams });
                candidates = res.results || [];
            }
            
            var animeMovies = candidates.filter(function(r) { return r.genre_ids && r.genre_ids.indexOf(16) !== -1; });
            if (animeMovies.length > 0) return animeMovies.find(function(r) { return r.poster_path; }) || animeMovies[0];

        } catch (e) {
            console.warn("TMDB 搜索失败: " + query, e);
        }
        return null;
    }

    var match = await doSearch(title1);
    if (!match && title2 && title1 !== title2) {
        match = await doSearch(title2);
    }
    return match;
}

/**
 * 将 TMDB 数据转换为标准 MediaItem 格式
 */
function buildTmdbItem(tmdbMatch, originalTitle) {
    var isMovie = !!tmdbMatch.title;
    var title = tmdbMatch.name || tmdbMatch.title || originalTitle;
    var date = tmdbMatch.first_air_date || tmdbMatch.release_date || "";
    var rating = tmdbMatch.vote_average ? tmdbMatch.vote_average.toFixed(1) : null;
    
    return {
        id: String(tmdbMatch.id),
        title: title,
        description: tmdbMatch.overview || (originalTitle ? "动漫花园资源" : ""),
        posterUrl: tmdbMatch.poster_path ? "https://image.tmdb.org/t/p/w500" + tmdbMatch.poster_path : null,
        backdropUrl: tmdbMatch.backdrop_path ? "https://image.tmdb.org/t/p/w780" + tmdbMatch.backdrop_path : null,
        rating: rating,
        year: date.substring(0, 4),
        mediaType: isMovie ? "movie" : "tv"
    };
}

// =========================================================================
// 动漫花园 API 调用
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

        // 限制最多 15 条，避免请求过载
        var MAX_ITEMS = 15;
        var limited = list.slice(0, MAX_ITEMS);

        // 4. 为每个条目清洗标题并请求 TMDB
        var enrichedItems = [];
        var concurrency = 2; // 并发数降低避免超时
        for (var idx = 0; idx < limited.length; idx += concurrency) {
            var chunk = limited.slice(idx, idx + concurrency);
            var promises = chunk.map(async function(item) {
                try {
                    var rawTitle = item.title || "";
                    var cleanName = cleanTitle(rawTitle);
                    // 尝试从标题中提取年份
                    var year = null;
                    var yearMatch = rawTitle.match(/(19|20)\d{2}/);
                    if (yearMatch) year = yearMatch[0];

                    var tmdbData = await searchTmdbAnimeStrict(cleanName, null, year);
                    
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
                        var enriched = buildTmdbItem(tmdbData, rawTitle);
                        // 保留原有链接和ID
                        enriched.id = String(item.id);
                        enriched.link = item.link;
                        enriched.description = enriched.description || mediaItem.description;
                        return enriched;
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
            // 批次间延迟
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
