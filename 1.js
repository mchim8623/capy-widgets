var WidgetMetadata = {
  id: "emby_most_watched_servers",
  title: "Emby 最常看服务器",
  description: "统计多个 Emby 服务器的播放次数，显示最常使用的 10 个服务器",
  version: "1.0.0",
  modules: [
    {
      id: "most_watched",
      title: "最常看服务器",
      type: "media_list",
      functionName: "getMostWatchedServers",
      cacheDuration: 3600,
      params: [
        {
          name: "servers_config",
          label: "服务器配置 (JSON)",
          type: "string",
          description: "JSON 数组，每个对象包含 name, url, apiKey, userId (可选，若不提供则自动获取第一个用户)",
          defaultValue: '[{"name":"我的Emby","url":"http://192.168.1.100:8096","apiKey":"your_api_key"}]'
        }
      ]
    }
  ]
};

async function getMostWatchedServers(params) {
  var configStr = params.servers_config;
  if (!configStr || typeof configStr !== 'string') {
    console.error("无效的服务器配置：未提供或类型错误");
    return [];
  }
  var servers;
  try {
    servers = JSON.parse(configStr);
  } catch (e) {
    console.error("解析服务器配置 JSON 失败:", e.message);
    return [];
  }
  if (!Array.isArray(servers) || servers.length === 0) {
    console.error("服务器配置必须为非空数组");
    return [];
  }

  var results = [];
  var promises = servers.map(function(server) {
    return fetchServerPlayCount(server).then(function(countInfo) {
      results.push(countInfo);
    }).catch(function(err) {
      console.error("处理服务器 " + (server.name || server.url) + " 时出错:", err.message);
    });
  });
  await Promise.all(promises);

  results.sort(function(a, b) {
    return b.playCount - a.playCount;
  });
  var top10 = results.slice(0, 10);

  return top10.map(function(info, idx) {
    return {
      id: "server_" + idx + "_" + info.name.replace(/[^a-zA-Z0-9]/g, '_'),
      title: info.name,
      description: "播放次数: " + info.playCount,
      rating: info.playCount,
      posterUrl: info.iconUrl || "",
      mediaType: "collection",
      year: null,
      link: info.url || null
    };
  });
}

async function fetchServerPlayCount(server) {
  var name = server.name || server.url || "未知服务器";
  var url = server.url;
  var apiKey = server.apiKey;
  var userId = server.userId;

  if (!url || !apiKey) {
    throw new Error("服务器缺少 url 或 apiKey");
  }
  if (!userId) {
    userId = await getFirstUserId(url, apiKey);
    if (!userId) {
      throw new Error("无法获取用户 ID");
    }
  }

  var totalPlays = 0;
  var limit = 100;
  var maxItems = 500;
  var startIndex = 0;
  var hasMore = true;

  while (hasMore && startIndex < maxItems) {
    var path = "/Users/" + userId + "/Items";
    var query = {
      Filters: "IsPlayed",
      Fields: "UserData",
      Limit: limit,
      StartIndex: startIndex,
      SortBy: "DatePlayed",
      SortOrder: "Descending"
    };
    var resp = await Widget.http.get(url + path, {
      params: query,
      headers: {
        "X-Emby-Token": apiKey,
        "Accept": "application/json"
      }
    });
    if (!resp.ok) {
      throw new Error("HTTP " + resp.status + " - " + path);
    }
    var data = typeof resp.data === "string" ? JSON.parse(resp.data) : resp.data;
    var items = data.Items || [];
    if (!items.length) break;

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var playCount = 0;
      if (item.UserData && typeof item.UserData.PlayCount === "number") {
        playCount = item.UserData.PlayCount;
      } else {
        playCount = 1;
      }
      totalPlays += playCount;
    }

    startIndex += items.length;
    if (items.length < limit || startIndex >= maxItems) {
      hasMore = false;
    }
  }

  return {
    name: name,
    url: url,
    playCount: totalPlays,
    iconUrl: server.iconUrl || ""
  };
}

async function getFirstUserId(baseUrl, apiKey) {
  var path = "/Users";
  var resp = await Widget.http.get(baseUrl + path, {
    headers: {
      "X-Emby-Token": apiKey,
      "Accept": "application/json"
    }
  });
  if (!resp.ok) {
    throw new Error("获取用户列表失败: HTTP " + resp.status);
  }
  var data = typeof resp.data === "string" ? JSON.parse(resp.data) : resp.data;
  var users = Array.isArray(data) ? data : (data.Items || []);
  if (users.length === 0) {
    throw new Error("没有找到任何用户");
  }
  return users[0].Id;
}