var WidgetMetadata = {
  id: "dmhy_random_recommend",
  title: "动漫花园随机推荐",
  description: "随机推荐动漫花园资源，每次刷新都可能不同",
  version: "2.1.0",
  modules: [
    {
      id: "random_recommend",
      title: "随机推荐",
      type: "media_list",
      functionName: "getRandomRecommend",
      cacheDuration: 300
    }
  ]
};

var API_BASE = "https://dmhy.myheartsite.com/api/acg";

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

async function searchWithKeyword(keyword, page) {
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

async function getRandomRecommend(params) {
  try {
    // 先请求第一页（关键词为空）获取总页数
    var firstData = await searchWithKeyword("", 1);
    var totalNum = firstData.totalNum || 0;
    var pageSize = (firstData.searchData && firstData.searchData.length) || 20;
    var totalPages = Math.ceil(totalNum / pageSize);
    if (totalPages <= 0) {
      console.warn("没有数据");
      return [];
    }

    // 随机选择页码（至少1，不超过总页数）
    var randomPage = randomInt(1, totalPages);
    var randomData = await searchWithKeyword("", randomPage);
    var list = randomData.searchData || [];
    if (!list.length) {
      return [];
    }

    // 随机打乱结果
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = list[i];
      list[i] = list[j];
      list[j] = temp;
    }

    // 限制最多返回30条
    var limited = list.slice(0, 30);
    return limited.map(function(item) {
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
    });
  } catch (err) {
    console.error("随机推荐失败", err);
    return [];
  }
}

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
