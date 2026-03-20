// =========================================================================
// 动漫花园随机推荐组件（TMDB 增强版）
// =========================================================================

var WidgetMetadata = {
    id: "dmhy_random_tmdb",
    title: "动漫花园随机推荐",
    description: "随机推荐动漫花园资源（此版本为demo阶段，有问题请反馈）",
    author: "刺猬兽",
    version: "2.1.4-beta",
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
const API_BASE = "https://dmhy.myheartsite.com/api/acg";

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
    const parts = [];
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const value = obj[key];
            if (value !== undefined && value !== null) {
                parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
            }
        }
    }
    return parts.join("&");
}

/**
 * 清洗动漫花园标题，提取核心作品名称
 * 例如: "[❀拨雪寻春❀] 送葬者芙莉莲 第二季 / ... - 35 [...]" -> "葬送的芙莉莲"
 * 规则：
 * - 移除方括号内容 [制作组]
 * - 移除斜杠后的日文/英文名
 * - 移除 "- 数字" 及之后的格式信息
 * - 移除 "第X季/期" 等季数标记
 */
function cleanTitle(rawTitle) {
    if (!rawTitle) return "";
    
    // 1. 移除方括号内的内容（制作组、版本等）
    let cleaned = rawTitle.replace(/\[[^\]]*\]/g, "").trim();
    
    // 2. 如果有斜杠，取第一部分（通常是中文名）
    if (cleaned.includes("/")) {
        cleaned = cleaned.split("/")[0].trim();
    }
    
    // 3. 移除 "- 数字" 格式的集数信息
    cleaned = cleaned.replace(/\s*-\s*\d+\s*\[.*\]/, "").trim();
    
    // 4. 移除 "第X季"、"第二期" 等季数标记（保留核心名）
    cleaned = cleaned.replace(/\s*第[一二三四五六七八九十\d]+[季期]\s*/g, "").trim();
    
    // 5. 移除末尾的版本标记如 "[WebRip]" 等
    cleaned = cleaned.replace(/\s*\[[^\]]*\]\s*$/, "").trim();
    
    // 6. 移除常见后缀（如 " / " 后的内容已处理过，但仍有残留）
    cleaned = cleaned.replace(/\s*\/\s*.*$/, "").trim();
    
    // 7. 如果清理后为空，返回原始标题
    return cleaned || rawTitle;
}

/**
 * TMDB 严格动画搜索
 * 优先搜索 TV，其次 Movie，并确保包含动画标签 (genre_ids 包含 16)
 */
async function searchTmdbAnime(query, yearHint) {
    if (!query) return null;
    
    // 清洗查询词
    const cleanQuery = query.trim();
    
    // 1. 搜索 TV 剧集
    try {
        let tvParams = {
            query: cleanQuery,
            language: "zh-CN",
            include_adult: false
        };
        if (yearHint) tvParams.first_air_date_year = yearHint;
        
        let res = await Widget.tmdb.get("/search/tv", { params: tvParams });
        let candidates = res.results || [];
        
        // 如果带年份没搜到，去掉年份重试
        if (candidates.length === 0 && yearHint) {
            delete tvParams.first_air_date_year;
            res = await Widget.tmdb.get("/search/tv", { params: tvParams });
            candidates = res.results || [];
        }
        
        // 过滤动画标签
        const animeTVs = candidates.filter(r => r.genre_ids && r.genre_ids.includes(16));
        if (animeTVs.length > 0) {
            // 优先返回有海报的
            return animeTVs.find(r => r.poster_path) || animeTVs[0];
        }
    } catch (e) {}
    
    // 2. 搜索电影（剧场版）
    try {
        let movieParams = {
            query: cleanQuery,
            language: "zh-CN",
            include_adult: false
        };
        if (yearHint) movieParams.primary_release_year = yearHint;
        
        let res = await Widget.tmdb.get("/search/movie", { params: movieParams });
        let candidates = res.results || [];
        
        if (candidates.length === 0 && yearHint) {
            delete movieParams.primary_release_year;
            res = await Widget.tmdb.get("/search/movie", { params: movieParams });
            candidates = res.results || [];
        }
        
        const animeMovies = candidates.filter(r => r.genre_ids && r.genre_ids.includes(16));
        if (animeMovies.length > 0) {
            return animeMovies.find(r => r.poster_path) || animeMovies[0];
        }
    } catch (e) {}
    
    return null;
}

/**
 * 将 TMDB 条目转换为 MediaItem 所需的图片字段
 */
function enrichWithTmdb(item, tmdbData) {
    if (!tmdbData) return item;
    
    // 确定媒体类型
    const mediaType = tmdbData.title ? "movie" : "tv";
    const title = tmdbData.name || tmdbData.title || item.title;
    const year = (tmdbData.first_air_date || tmdbData.release_date || "").substring(0, 4);
    
    // 构建描述（优先使用 overview，否则用原描述）
    const description = tmdbData.overview || item.description;
    
    // 构建评分
    const rating = tmdbData.vote_average ? tmdbData.vote_average.toFixed(1) : null;
    
    return {
        id: item.id,
        title: title,
        description: description,
        link: item.link,
        posterUrl: tmdbData.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}` : null,
        backdropUrl: tmdbData.backdrop_path ? `https://image.tmdb.org/t/p/w780${tmdbData.backdrop_path}` : null,
        rating: rating,
        year: year,
        mediaType: mediaType
    };
}

// =========================================================================
// 动漫花园 API 调用
// =========================================================================

async function searchAnime(keyword, page) {
    const url = API_BASE + "/search";
    const body = {
        keyword: keyword,
        page: page,
        searchType: "0",
        serverType: "server1"
    };
    const formBody = toFormUrlEncoded(body);

    const resp = await Widget.http.post(url, formBody, {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36"
        }
    });

    if (!resp.ok) {
        throw new Error("HTTP " + resp.status);
    }
    const json = safeJson(resp.data);
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
        const firstData = await searchAnime("", 1);
        const totalNum = firstData.totalNum || 0;
        const pageSize = (firstData.searchData && firstData.searchData.length) || 20;
        const totalPages = Math.ceil(totalNum / pageSize);
        
        if (totalPages <= 0) {
            console.warn("动漫花园没有数据");
            return [];
        }
        
        // 2. 随机选页
        const randomPage = randomInt(1, totalPages);
        const randomData = await searchAnime("", randomPage);
        let list = randomData.searchData || [];
        if (!list.length) return [];
        
        // 3. 随机打乱
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        
        // 限制最多 30 条
        const limited = list.slice(0, 30);
        
        // 4. 为每个条目清洗标题并请求 TMDB
        const enrichedItems = [];
        // 注意：为避免并发过多，使用串行 + 简单延迟，或控制并发数
        // 此处使用 Promise.all 并控制并发限制为 5
        const concurrency = 5;
        for (let i = 0; i < limited.length; i += concurrency) {
            const chunk = limited.slice(i, i + concurrency);
            const promises = chunk.map(async (item) => {
                try {
                    const rawTitle = item.title || "";
                    const cleanName = cleanTitle(rawTitle);
                    // 尝试从标题中提取年份（如果有）
                    let year = null;
                    const yearMatch = rawTitle.match(/(19|20)\d{2}/);
                    if (yearMatch) year = yearMatch[0];
                    
                    const tmdbData = await searchTmdbAnime(cleanName, year);
                    let mediaItem = {
                        id: String(item.id),
                        title: rawTitle,
                        description: `大小: ${item.size || "未知"} | 发布组: ${item.group || "未知"}`,
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
                    console.error(`处理条目 ${item.id} 失败:`, err);
                    return {
                        id: String(item.id),
                        title: item.title || "无标题",
                        description: `大小: ${item.size || "未知"} | 发布组: ${item.group || "未知"}`,
                        link: item.link,
                        posterUrl: null,
                        backdropUrl: null,
                        rating: null,
                        year: null,
                        mediaType: "movie"
                    };
                }
            });
            const results = await Promise.all(promises);
            enrichedItems.push(...results);
            // 简单延迟，避免请求过快
            if (i + concurrency < limited.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
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

    const idMatch = link.match(/\/view\/(\d+)_/);
    if (!idMatch) {
        console.error("无法从链接解析ID:", link);
        return { videoUrl: null };
    }

    const id = idMatch[1];
    const url = API_BASE + "/detail";
    const body = {
        link: link,
        id: id
    };

    try {
        const resp = await Widget.http.post(url, body, {
            headers: { "Content-Type": "application/json" }
        });
        if (!resp.ok) {
            throw new Error("HTTP " + resp.status);
        }
        const json = safeJson(resp.data);
        if (json.code !== 1) {
            throw new Error(json.msg || "获取详情失败");
        }
        const data = json.data;
        const magnet = data.magnetLink2 || data.magnetLink1;
        if (!magnet) {
            return { videoUrl: null };
        }
        return { videoUrl: magnet };
    } catch (err) {
        console.error("获取磁力链接失败", err);
        return { videoUrl: null };
    }
}        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }

        // 4. 限制最多30条
        const limited = list.slice(0, 30);

        // 5. 映射为 MediaItem 格式
        return limited.map(item => ({
            id: String(item.id),
            title: item.title || "无标题",
            description: `大小: ${item.size || "未知"} | 发布组: ${item.group || "未知"}`,
            link: item.link,
            posterUrl: null,
            backdropUrl: null,
            rating: null,
            year: null,
            mediaType: "movie"
        }));
    } catch (err) {
        console.error("随机推荐失败", err);
        return [];
    }
}

async function loadDetail(link) {
    if (!link) {
        return { videoUrl: null };
    }

    const idMatch = link.match(/\/view\/(\d+)_/);
    if (!idMatch) {
        console.error("无法从链接解析ID:", link);
        return { videoUrl: null };
    }

    const id = idMatch[1];
    const url = API_BASE + "/detail";
    const body = {
        link: link,
        id: id
    };

    try {
        const resp = await Widget.http.post(url, body, {
            headers: { "Content-Type": "application/json" }
        });
        if (!resp.ok) {
            throw new Error("HTTP " + resp.status);
        }
        const json = safeJson(resp.data);
        if (json.code !== 1) {
            throw new Error(json.msg || "获取详情失败");
        }
        const data = json.data;
        const magnet = data.magnetLink2 || data.magnetLink1;
        if (!magnet) {
            return { videoUrl: null };
        }
        return { videoUrl: magnet };
    } catch (err) {
        console.error("获取磁力链接失败", err);
        return { videoUrl: null };
    }
}
