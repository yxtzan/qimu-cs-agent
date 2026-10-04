# 部署到公网（T23）：阿里云杭州 ECS，用 IP 地址访问

> 维护者：Claude。人类照着做，每做完一大步告诉 Claude。决策依据见 DECISIONS D014（2026-10-04 修订）。
> 全程**不要把 OpenRouter key、服务器密码发到任何聊天里**（包括发给 Claude）。
> 服务器：华东1（杭州）ECS，公网 IP `120.27.142.15`，系统 Alibaba Cloud Linux 4，2 核 4G。
> 网址：`http://120.27.142.15`。内地服务器用域名必须先备案，所以暂时没有域名和 HTTPS（见文末）。

---

## 已经完成的（2026-10-04）

- [x] 连通测试：OpenRouter 可达（建连 + 加密握手约 0.5 秒，完全够用）；npm 很快；GitHub 很慢 → 不从 GitHub 拉代码，改为上传压缩包。
- [x] 安全组放行 80 端口（入方向，0.0.0.0/0，描述「网站」）。
- [x] 装好 Node 22（npmmirror 镜像）和 pm2，npm 源已切到 npmmirror。

## 第 1 步：顺手收紧安全组（1 分钟，可选但建议做）

服务器页面 →「网络与安全组」→ 点 `sg-` 开头的安全组 →「入方向」：

- **RDP(3389)** 那条：这是 Windows 远程桌面用的，你的服务器是 Linux，用不到 → 点「删除」。
- **8888** 那条：10 月 1 日你自己加的。如果不记得它是做什么的，也可以删掉；以后需要再加。
- **SSH(22)** 那条：**不要删**，Workbench 远程连接要用它。

## 第 2 步：上传代码（T22 合并后再做）

1. Claude 会在你电脑的「客服 agent」文件夹里生成一个 `qimu-deploy.tar.gz`（只有代码，不含 key）。
2. 打开 Workbench 远程连接的终端页面，在**顶部菜单找「文件」**（或左侧的文件树图标）→ 选「上传文件」→ 上传位置选 `/root` → 选中电脑上的 `qimu-deploy.tar.gz` → 上传。
   找不到上传入口就截图发给 Claude。
3. 上传完成后，在终端粘贴：
   ```
   mkdir -p /opt/qimu && tar -xzf /root/qimu-deploy.tar.gz -C /opt/qimu && cd /opt/qimu && npm ci
   ```
   `npm ci` 要 1–3 分钟，最后出现 `added ... packages` 就是成功。

## 第 3 步：放配置文件（3 分钟）

`.env.local` 里有你的 key，不经过任何聊天，直接从电脑上传：

1. 同样用 Workbench 的「上传文件」，上传位置填 `/opt/qimu`，选你电脑上「客服 agent」文件夹里的 `.env.local`。
   Mac 的文件选择框默认不显示以点开头的文件：在选择框里按 **`Cmd + Shift + .`**（句号）就能看到。
2. 在终端粘贴（给公开网站加上三项设置，不会显示 key）：
   ```
   cd /opt/qimu && printf '\nNEXT_PUBLIC_USE_MOCK=0\nPUBLIC_DEMO=1\nDAILY_BUDGET_USD=1\n' >> .env.local && grep -c OPENROUTER_API_KEY .env.local
   ```
   最后输出 `1` 就说明 key 那一行在文件里（只显示个数，不显示内容）。
3. **去 OpenRouter 给这把 key 设额度上限**：openrouter.ai → Keys → 这把 key → Credit limit 设成例如 $5。这是第三道保险。

## 第 4 步：构建并启动（约 5 分钟）

```
cd /opt/qimu && npm run build && npm run seed
```
看到 build 成功（没有红色的 `Error`）、seed 结束后，再粘贴：
```
cd /opt/qimu && PORT=80 pm2 start npm --name qimu -- start && pm2 save && pm2 startup systemd -u root --hp /root
```
然后检查：
```
curl -s localhost/api/health
```
看到 `{"ok":true}` 就说明网站起来了。

## 第 5 步：在浏览器验收

1. 电脑浏览器打开 `http://120.27.142.15`，能看到商城首页。
2. 打开 `http://120.27.142.15/?demo=1`，从头走一遍演示模式。
3. 用手机（关掉 Wi-Fi，用流量）也打开一次，确认外网能访问。
4. 打开聊天窗右上角「调试」：回复下面应显示 L1/L2/L3 和 jev，不是 mock。

---

## 以后更新代码

Claude 生成新的 `qimu-deploy.tar.gz` → 上传到 `/root`（覆盖）→ 粘贴：
```
cd /opt/qimu && tar -xzf /root/qimu-deploy.tar.gz -C /opt/qimu && npm ci && npm run build && pm2 restart qimu
```
（解压会覆盖代码，但保留 `.env.local` 和运行数据。）

## 出问题时

| 情况 | 怎么办 |
|---|---|
| 浏览器打不开 `http://120.27.142.15` | 确认安全组 80 端口规则还在；终端执行 `pm2 status`，`qimu` 应是 `online` |
| 页面打开但报错 / 502 | 执行 `pm2 logs qimu --lines 50`，把输出发给 Claude（日志里不会有 key） |
| 回复全是 mock | 检查第 3 步：`.env.local` 里要有 `NEXT_PUBLIC_USE_MOCK=0`，且必须在 `npm run build` **之前**放好；改了要重新 build |
| 服务器重启后网站没起来 | 执行 `pm2 resurrect`；第 4 步的 `pm2 startup` 没成功的话，把输出发给 Claude |

## 以后想用域名（可选）

内地服务器的域名必须先 ICP 备案（阿里云顶栏「备案」，一般 1–3 周；阿里云通常要求服务器是包年包月且剩余 3 个月以上，按量付费的实例可能不能用来备案）。备案通过后，在云解析 DNS 给 `yxtzan.com` 加一条 A 记录（如 `demo` → `120.27.142.15`），再加 HTTPS，Claude 到时再写步骤。不想等备案，也可以换香港服务器（不用备案）。
