# 部署到公网（T23）：阿里云香港轻量服务器 + 子域名 + HTTPS

> 维护者：Claude。人类照着做，每做完一大步告诉 Claude。决策依据见 DECISIONS D014。
> 全程**不要把 OpenRouter key、GitHub token、服务器密码发到任何聊天里**（包括发给 Claude）。
> 下文的 `demo.你的域名.com` 换成你实际的子域名，`服务器IP` 换成服务器的公网 IP。

现在就可以先做第 1–3 步（买服务器、开端口、配域名解析），不用等代码。第 4 步之后要等 T22 合并。

---

## 第 1 步：买服务器（约 10 分钟）

1. 登录阿里云 → 搜索「轻量应用服务器」→ 创建实例。
2. **地域：中国香港**（一定要选香港，不用备案）。
3. **镜像：系统镜像 → Ubuntu 22.04**。
4. **套餐：2 核 2G 或以上**（1G 内存构建网站会失败）。
5. 购买时长按你的需要；买完进控制台，记下**公网 IP**。
6. 在实例详情里「重置密码」，设置一个 root 密码（自己记好，不要发给任何人）。

## 第 2 步：开放端口（2 分钟）

轻量服务器控制台 → 你的实例 → **防火墙** → 确认有以下规则，没有就添加：

| 端口 | 协议 | 用途 |
|---|---|---|
| 22 | TCP | 远程登录（默认已有） |
| 80 | TCP | 网页（申请证书也要用） |
| 443 | TCP | HTTPS 网页 |

## 第 3 步：配子域名解析（3 分钟，生效要几分钟到半小时）

1. 阿里云控制台 → 「云解析 DNS」→ 找到你的域名 → 「解析设置」→「添加记录」。
2. 填：
   - 记录类型：**A**
   - 主机记录：**demo**（网址就是 `demo.你的域名.com`；想用别的名字就换掉 demo）
   - 记录值：**服务器IP**
   - 其他保持默认 → 确认。
3. 这只新增了一条子域名记录，**主域名和个人网站不受影响**。

> 如果域名还没做实名认证，阿里云会提示先认证；香港服务器不需要备案。

## 第 4 步：登录服务器，装好基础环境（约 10 分钟）

1. 轻量服务器控制台 → 你的实例 → 「远程连接」→ 用 Workbench 登录（输入 root 密码）。之后的命令都粘贴到这个网页终端里，一次粘一段，等它跑完再粘下一段。

2. 加 2G 交换内存（防止构建时内存不够）：
   ```bash
   fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
   ```

3. 装 Node 22、git、pm2：
   ```bash
   apt-get update && apt-get install -y git curl
   curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
   apt-get install -y nodejs
   npm install -g pm2
   node -v
   ```
   最后一行应显示 `v22.` 开头。

4. 装 Caddy（自动申请 HTTPS 证书的网页服务器）：
   ```bash
   apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
   apt-get update && apt-get install -y caddy
   ```

## 第 5 步：拉代码（约 5 分钟，T22 合并后再做）

仓库是私有的，服务器需要一把**只读**的 GitHub 令牌：

1. 在电脑上打开 GitHub → 右上角头像 → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token。
   - Repository access：Only select repositories → 选 `qimu-cs-agent`
   - Permissions → Repository permissions → **Contents: Read-only**
   - 生成后复制（只显示一次）。**不要发到任何聊天里。**
2. 回到服务器终端，把下面命令里的 `你的令牌` 换成刚复制的令牌再执行：
   ```bash
   cd /opt && git clone https://你的令牌@github.com/yxtzan/qimu-cs-agent.git qimu && cd /opt/qimu && npm ci
   ```

## 第 6 步：写服务器上的配置文件（3 分钟）

1. 执行 `nano /opt/qimu/.env.local`，打开一个编辑器。
2. 把你电脑上「客服 agent」文件夹里 `.env.local` 的内容**在电脑上复制**，粘贴进来（不要经过任何聊天）。
3. 在末尾再加这几行（如果已有同名的行，改成下面的值）：
   ```
   NEXT_PUBLIC_USE_MOCK=0
   PUBLIC_DEMO=1
   DAILY_BUDGET_USD=1
   ```
4. 按 `Ctrl+O` 回车保存，`Ctrl+X` 退出。

5. **去 OpenRouter 给这把 key 设额度上限**：openrouter.ai → Keys → 这把 key → 设置 Credit limit（例如 $5）。这是第三道保险。

## 第 7 步：构建并启动（约 5–10 分钟）

```bash
cd /opt/qimu && npm run build && npm run seed && pm2 start npm --name qimu -- start && pm2 save && pm2 startup systemd -u root --hp /root
```
等它跑完，执行 `curl -s localhost:3000/api/health`，看到 `{"ok":true}` 就说明网站起来了。

## 第 8 步：挂上子域名和 HTTPS（2 分钟）

把 `demo.你的域名.com` 换成你的子域名再执行：
```bash
printf 'demo.你的域名.com {\n  reverse_proxy localhost:3000\n}\n' > /etc/caddy/Caddyfile && systemctl reload caddy
```
等半分钟，在电脑浏览器打开 `https://demo.你的域名.com`。能打开、地址栏有小锁，就完成了。再打开 `https://demo.你的域名.com/?demo=1` 走一遍演示模式。

---

## 以后更新代码

```bash
cd /opt/qimu && git pull && npm ci && npm run build && pm2 restart qimu
```

## 出问题时

| 情况 | 怎么办 |
|---|---|
| 浏览器打不开子域名 | 解析可能还没生效：等 10 分钟再试；在电脑终端运行 `ping demo.你的域名.com`，看返回的 IP 是不是你的服务器 |
| 打开是 502 | 网站没在运行：服务器上执行 `pm2 logs qimu --lines 50`，把输出（不含 key）发给 Claude |
| 构建时报内存不足 | 确认第 4 步的交换内存加上了：`free -h` 里 Swap 应该是 2.0Gi |
| 证书申请失败 | 确认防火墙开了 80 和 443、解析已经指向服务器 IP，然后 `systemctl reload caddy` |
