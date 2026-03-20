// =========================================================================
// 动漫花园随机推荐组件（Bangumi 增强版，优化标题提取与信息展示）
// =========================================================================

var WidgetMetadata = {
    id: "dmhy_random_bangumi",
    title: "动漫花园随机推荐",
    description: "随机推荐动漫花园资源，自动匹配 Bangumi 海报与简介（此版本为demo阶段，有问题请反馈）",
    author: "刺猬兽",
    version: "2.3.2-beta",
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
var BGM_API = "https://api.bgm.tv";

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

/**
 * 增强版标题清洗函数，遵循常见 BT 组命名规则
 * 例如：
 *   [字幕组] 作品名 第XX话 [分辨率][编码] → 作品名
 *   葬送のフリーレン 第二期 [WebRip][HEVC-10bit 1080p][简日内嵌] → 葬送のフリーレン 第二期
 *   [DBD-Raws][金田一少年事件簿3][00-10TV全集][1080P][BDRip][AVC][简日内嵌][AAC][MP4] → 金田一少年事件簿3
 */
function cleanTitle(rawTitle) {
    if (!rawTitle) return "";
    
    // 1. 移除所有方括号内容（包括嵌套的括号）
    var cleaned = rawTitle;
    while (cleaned.includes("[") && cleaned.includes("]")) {
        cleaned = cleaned.replace(/\[[^\]]*\]/g, "");
    }
    cleaned = cleaned.trim();
    
    // 2. 如果有斜杠，取第一部分（通常是主要名称）
    if (cleaned.includes("/")) {
        cleaned = cleaned.split("/")[0].trim();
    }
    
    // 3. 移除 "- 数字 [xxx]" 格式（如 "- 35 [WebRip]"）
    cleaned = cleaned.replace(/\s*-\s*\d+\s*\[[^\]]*\]\s*/, " ").trim();
    
    // 4. 移除集数标记：第XX话/集，EPXX，Vol.X等
    cleaned = cleaned.replace(/\s*第[一二三四五六七八九十\d]+[话话集期]\s*/g, " ");
    cleaned = cleaned.replace(/\s*EP\d+\s*/gi, " ");
    cleaned = cleaned.replace(/\s*Vol\.?\d+\s*/gi, " ");
    
    // 5. 移除分辨率、编码等常见技术标记（保留在末尾的）
    cleaned = cleaned.replace(/\s*\[[^\]]*\]\s*$/g, "");  // 移除末尾方括号
    cleaned = cleaned.replace(/\s*(1080p|720p|480p|BDRip|WebRip|HEVC|AVC|x264|x265|10bit|AAC|FLAC|MKV|MP4)\s*/gi, " ");
    
    // 6. 移除多余空格
    cleaned = cleaned.replace(/\s+/g, " ").trim();
    
    // 7. 如果清理后为空，返回原始标题
    return cleaned || rawTitle;
}

/**
 * 从 Bangumi 搜索动漫
 * @param {string} keyword 搜索关键词
 * @returns {Promise<Object|null>} 返回匹配度最高的条目，失败返回 null
 */
async function searchBangumiAnime(keyword) {
    if (!keyword) return null;
    try {
        // Bangumi 搜索接口，type=2 表示动画，responseGroup=medium 返回详细信息
        var url = BGM_API + "/search/subject/" + encodeURIComponent(keyword) + "?type=2&responseGroup=medium";
        var resp = await Widget.http.get(url, {
            headers: { "User-Agent": "Mozilla/5.0" },
            timeout: 10000
        });
        if (!resp.ok) {
            console.warn("Bangumi 搜索失败，HTTP " + resp.status);
            return null;
        }
        var json = safeJson(resp.data);
        var list = json.list || [];
        if (list.length === 0) return null;
        // 取第一个结果（通常是最匹配的）
        return list[0];
    } catch (err) {
        console.warn("Bangumi 搜索异常: " + keyword, err);
        return null;
    }
}

/**
 * 将 Bangumi 条目转换为标准 MediaItem 格式，同时保留原始资源信息
 */
function buildMediaItemFromBangumi(bgmItem, originalTitle, link, size, group) {
    // 基础描述：包含大小和发布组信息（即使有简介也保留）
    var baseDesc = "大小: " + (size || "未知") + " | 发布组: " + (group || "未知");
    
    if (!bgmItem) {
        // 无匹配时返回原始信息
        return {
            id: "dmhy_" + originalTitle.replace(/\s+/g, "_") + "_" + Date.now(),
            title: originalTitle,
            description: baseDesc,
            link: link,
            posterUrl: null,
            backdropUrl: null,
            rating: null,
            year: null,
            mediaType: "movie"
        };
    }

    var title = bgmItem.name_cn || bgmItem.name || originalTitle;
    var poster = bgmItem.images ? (bgmItem.images.large || bgmItem.images.medium || bgmItem.images.common) : null;
    var rating = bgmItem.rating ? bgmItem.rating.score : null;
    var year = bgmItem.air_date ? bgmItem.air_date.substring(0, 4) : null;
    
    // 合并简介：如果有 Bangumi 简介，则在其后附加资源信息，否则直接用资源信息
    var description = baseDesc;
    if (bgmItem.summary && bgmItem.summary.trim()) {
        description = bgmItem.summary + "\n\n" + baseDesc;
    }

    return {
        id: String(bgmItem.id),
        title: title,
        description: description,
        link: link,
        posterUrl: poster,
        backdropUrl: null, // Bangumi 没有提供背景图，可留空
        rating: rating,
        year: year,
        mediaType: bgmItem.type === 2 ? "tv" : "movie" // type 2 是动画，一般视为 TV
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

        // 4. 为每个条目清洗标题并请求 Bangumi
        var enrichedItems = [];
        var concurrency = 2; // 并发数，避免 Bangumi 限流
        for (var idx = 0; idx < limited.length; idx += concurrency) {
            var chunk = limited.slice(idx, idx + concurrency);
            var promises = chunk.map(async function(item) {
                try {
                    var rawTitle = item.title || "";
                    var cleanName = cleanTitle(rawTitle);
                    // 尝试从标题中提取年份（可选，不传给 Bangumi，因为 Bangumi 搜索会自动匹配）
                    var bgmData = await searchBangumiAnime(cleanName);
                    var mediaItem = buildMediaItemFromBangumi(
                        bgmData,
                        rawTitle,
                        item.link,
                        item.size,
                        item.group
                    );
                    // 确保保留原始链接（已包含）
                    return mediaItem;
                } catch (err) {
                    console.error("处理条目 " + item.id + " 失败:", err);
                    return {
                        id: "dmhy_" + item.id,
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
            // 批次间延迟，避免 Bangumi 限流
            if (idx + concurrency < limited.length) {
                await new Promise(function(resolve) { setTimeout(resolve, 500); });
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
        // 返回磁力链接作为播放地址
        return { videoUrl: magnet };
    } catch (err) {
        console.error("获取磁力链接失败", err);
        return { videoUrl: null };
    }
}
