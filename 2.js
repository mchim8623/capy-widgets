
var WidgetMetadata = {
    id: "dmhy_random_recommend",
    title: "动漫花园随机推荐",
    description: "随机推荐动漫花园资源，每次刷新都可能不同",
    author: "刺猬兽",
    version: "2.1.3-beta",
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
        // 1. 请求第一页（关键词为空）获取总条目数和总页数
        const firstData = await searchAnime("", 1);
        const totalNum = firstData.totalNum || 0;
        const pageSize = (firstData.searchData && firstData.searchData.length) || 20;
        const totalPages = Math.ceil(totalNum / pageSize);
        
        if (totalPages <= 0) {
            console.warn("动漫花园没有数据");
            return [];
        }

        // 2. 随机选择一页
        const randomPage = randomInt(1, totalPages);
        const randomData = await searchAnime("", randomPage);
        let list = randomData.searchData || [];

        if (!list.length) {
            return [];
        }

        // 3. 随机打乱列表
        for (let i = list.length - 1; i > 0; i--) {
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
