var WidgetMetadata = {
  id: "dmhy_search",
  title: "动漫花园磁力搜索",
  description: "搜索动漫花园资源，获取磁力链接",
  version: "1.0.0",
  modules: [
    {
      id: "search",
      title: "关键词搜索",
      type: "media_list",
      functionName: "searchAnime",
      cacheDuration: 0,
      params: [
        {
          name: "keyword",
          label: "动漫名称",
          type: "string",
          required: true,
          placeholder: "输入关键词，如“金田一”"
        },
        {
          name: "page",
          label: "页码",
          type: "page"
        }
      ]
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

async function searchAnime(params) {
  var keyword = params.keyword || "";
  var page = params.page || 1;
  if (!keyword) {
    console.warn("关键词不能为空");
    return [];
  }

  var url = API_BASE + "/search";
  var body = {
    keyword: keyword,
    page: page,
    searchType: "0",
    serverType: "server1"
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
      throw new Error(json.msg || "搜索失败");
    }
    var list = json.data && json.data.searchData;
    if (!Array.isArray(list)) {
      return [];
    }
    return list.map(function(item, idx) {
      var id = String(item.id);
      return {
        id: id,
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
    console.error("搜索失败", err);
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
