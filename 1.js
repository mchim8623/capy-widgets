var WidgetMetadata = {
  id: "emby_most_watched_servers",
  title: "Emby 最常看服务器",
  description: "统计多个 Emby 服务器的播放次数，显示最常使用的 10 个服务器（使用用户名密码自动登录，支持 Emby/Jellyfin）",
  version: "1.0.2",
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
          label: "服务器列表 (JSON)",
          type: "string",
          description: "JSON数组，每项包含 name, url, username, password。密码将保存于本机存储，仅组件内部使用。示例：[{\"name\":\"家庭服务器\",\"url\":\"http://192.168.1.100:8096\",\"username\":\"user\",\"password\":\"pass\"}]",
          defaultValue: "[{\"name\":\"示例\",\"url\":\"http://localhost:8096\",\"username\":\"admin\",\"password\":\"123\"}]"
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
  var username = server.username;
  var password = server.password;

  if (!url || !username || !password) {
    throw new Error("服务器缺少 url、username 或 password");
  }

  // 登录获取 token 和 userId
  var auth = await loginToEmby(url, username, password);
  var token = auth.token;
  var userId = auth.userId;

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
        "X-Emby-Token": token,
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

async function loginToEmby(baseUrl, username, password) {
  // 尝试 Emby 标准登录端点
  var embyEndpoint = "/Users/authenticatebyname";
  // Jellyfin 使用的端点
  var jellyfinEndpoint = "/Users/AuthenticateByName";

  // 先尝试 Emby 格式
  var resp = await attemptLogin(baseUrl, embyEndpoint, username, password);
  if (resp.ok) {
    var data = typeof resp.data === "string" ? JSON.parse(resp.data) : resp.data;
    if (data.AccessToken && data.User && data.User.Id) {
      return { token: data.AccessToken, userId: data.User.Id };
    }
  }

  // 再尝试 Jellyfin 格式
  resp = await attemptLogin(baseUrl, jellyfinEndpoint, username, password);
  if (resp.ok) {
    var data = typeof resp.data === "string" ? JSON.parse(resp.data) : resp.data;
    if (data.AccessToken && data.User && data.User.Id) {
      return { token: data.AccessToken, userId: data.User.Id };
    }
  }

  // 如果两种都失败，抛出详细错误
  throw new Error("登录失败: 用户名密码错误或服务器不兼容 (Emby/Jellyfin 均尝试失败)");
}

async function attemptLogin(baseUrl, endpoint, username, password) {
  // 确保 baseUrl 不以斜杠结尾，endpoint 以斜杠开头
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }
  var fullUrl = baseUrl + endpoint;
  try {
    var resp = await Widget.http.post(fullUrl, {
      Username: username,
      Password: password
    }, {
      headers: {
        "Content-Type": "application/json"
      },
      timeout: 10000
    });
    return resp;
  } catch (e) {
    // 网络错误或其他异常
    console.error("登录请求异常:", e.message);
    return { ok: false, status: 0, data: null };
  }
  }        "Accept": "application/json"
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

async function loginToEmby(baseUrl, username, password) {
  var path = "/Users/authenticatebyname";
  var resp = await Widget.http.post(baseUrl + path, {
    Username: username,
    Password: password
  }, {
    headers: {
      "Content-Type": "application/json"
    }
  });
  if (!resp.ok) {
    throw new Error("登录失败: HTTP " + resp.status);
  }
  var data = typeof resp.data === "string" ? JSON.parse(resp.data) : resp.data;
  if (!data.AccessToken || !data.User || !data.User.Id) {
    throw new Error("登录响应缺少 token 或 userId");
  }
  return {
    token: data.AccessToken,
    userId: data.User.Id
  };
}
