# Frame/0 Studio · 容器化部署

提供两种部署方式：
1. **Docker 单机** —— Ubuntu / CentOS / RHEL / Rocky 直接跑容器
2. **Kubernetes 集群** —— Deployment + PVC + Service + Ingress + 可选 HPA

> ⚠️ **重要约束**：项目用本地 `/app/data` 文件存储（state / uploads / videos / dedup cache），默认部署 **单副本 + 数据持久化卷**（K8s 资源用的是 `Deployment` + RWO PVC，不是 StatefulSet）。要水平扩展需要先迁存储，详见下文「多副本 / 水平扩展」一节。

---

## 一、镜像构建

```bash
# 项目根
docker build -t frame-0:latest .
```

- 基础镜像 `node:22-alpine`，多阶段构建
- 最终镜像 ≈ 200MB（next standalone 模式）
- 非 root 运行（uid 1001）
- 自带 HEALTHCHECK

构建首次 ~2 分钟，二次 < 30 秒（依赖层 cache 友好）。

---

## 二、方式一：Docker 单机

### Ubuntu 装 Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # 重登生效
```

### CentOS 8/9 / RHEL 9 / Rocky 9 装 Docker

```bash
sudo dnf install -y dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

> CentOS 7 已 EOL,不推荐;实在要用,装 `docker-ce` + `docker-compose-plugin` 同上。

### 启动

```bash
# 1. （可选）准备 env —— 不准备就是访客全部自带 key 模式（推荐，最安全）
cp .env.example .env
vim .env   # 按需填 DASHSCOPE_API_KEY / REDDIT_* 等

# 2. 一键起
docker compose up -d

# 看日志
docker compose logs -f frame-0

# 升级（镜像重建）
docker compose build && docker compose up -d

# 停 / 销毁
docker compose stop
docker compose down               # 容器删除，data/ 卷保留
docker compose down -v            # ⚠️ 连卷一起删，慎用
```

访问：`http://<服务器IP>:3000`

### 数据目录 `./data/`

| 文件/目录 | 用途 | 重要程度 |
|---|---|---|
| `app-state.json` | 全局用户状态备份 | ★ |
| `upload-cache.json` | OSS 上传去重（24h TTL） | 中 |
| `uploads/` | 用户上传的原始图/视频字节 | ★★ |
| `videos/` | 生成视频的本地副本 | ★★ |

**备份**：定时 tar 一份就行。

```bash
# 每日 cron
tar czf /backups/frame-0-$(date +%F).tgz -C /path/to/frame-0 data/
find /backups -mtime +30 -delete    # 保留 30 天
```

---

## 三、方式二：Kubernetes

### 前置

- 集群 v1.25+
- 支持 ReadWriteOnce 的 storageClass（默认 sc 即可）
- 装了 `nginx-ingress` 或别的 ingress controller（可选）
- 本地 `kubectl` 1.14+（自带 `-k` kustomize）

### 推镜像到 registry

K8s 需要从 registry 拉镜像（不能用本地 docker daemon 的）：

```bash
# 打 tag + 推
docker tag frame-0:latest registry.example.com/frame-0:v1
docker push registry.example.com/frame-0:v1
```

然后改 `deploy/k8s/deployment.yaml` 的 `image:` 字段。

### 配置 Secret

```bash
cp deploy/k8s/secret.example.yaml deploy/k8s/secret.yaml
vim deploy/k8s/secret.yaml        # 按需填值
echo "deploy/k8s/secret.yaml" >> .gitignore   # 防误 commit
```

如果**不要**服务端兜底 key（强制访客自带）—— `secret.yaml` 全留空即可，照样 apply（k8s 允许空字符串 secret）。

启用：编辑 `deploy/k8s/kustomization.yaml`，uncomment `- secret.yaml` 那行。

### 配置 Ingress

```bash
# 改域名
sed -i 's/frame-0.example.com/frame.your-domain.com/g' deploy/k8s/ingress.yaml

# 装了 cert-manager 的话：uncomment ingress.yaml 里的 cert-manager annotation 和 tls 块
```

### 一键拉起

```bash
kubectl apply -k deploy/k8s/

# 看 Pod 状态
kubectl -n frame-0 get pods -w
kubectl -n frame-0 logs -f deploy/frame-0

# 没有 Ingress 时本地端口转发测试
kubectl -n frame-0 port-forward svc/frame-0 8080:80
# 然后 http://localhost:8080
```

### 升级

```bash
# 推新镜像
docker push registry.example.com/frame-0:v2

# 改 deployment.yaml 的 image tag → apply
kubectl apply -k deploy/k8s/

# 看滚动状态（注意：strategy=Recreate 模式下会有短暂中断）
kubectl -n frame-0 rollout status deploy/frame-0

# 回滚
kubectl -n frame-0 rollout undo deploy/frame-0
```

### 数据备份

```bash
POD=$(kubectl -n frame-0 get pod -l app.kubernetes.io/name=frame-0 -o name | head -1)
kubectl -n frame-0 cp "${POD#pod/}":/app/data ./backup-$(date +%F)
```

或者直接对底层 PV 卷做 storageClass 层面快照（云厂商通常支持）。

### 销毁

```bash
kubectl delete -k deploy/k8s/
# ⚠️ PVC 默认会保留（StorageClass 的 reclaimPolicy 决定）
# 要彻底清掉：
kubectl -n frame-0 delete pvc frame-0-data
```

---

## 四、多副本 / 水平扩展

⚠️ 默认 1 副本。原因：`/app/data` 是本地文件存储，ReadWriteOnce 卷只能挂一个 Pod。

要 HPA 水平扩展两条路：

| 方案 | 改动 | 优劣 |
|---|---|---|
| **A. 换 RWX 卷（最快）** | `pvc.yaml` 的 `accessModes` 改 `ReadWriteMany`；集群有 NFS / CephFS / EFS / Longhorn / OSS-CSI 等 RWX storageClass | ✅ 改动小 ❌ RWX 卷 IO 比 RWO 慢；多 Pod 写同一文件需小心一致性 |
| **B. 状态迁出（彻底）** | uploads 走 OSS / S3 直传；state 走 Redis；upload-cache 走 Redis ETag | ✅ 真正水平伸缩 ❌ 代码改造大 |

做完 A 或 B 后：
1. `deployment.yaml`：`strategy.type` 改回 `RollingUpdate`，`replicas` 提到 2+
2. `kustomization.yaml`：uncomment `- hpa.yaml`
3. `kubectl apply -k deploy/k8s/`

---

## 五、环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `DASHSCOPE_API_KEY` | 否 | 服务端兜底百炼 key。**公开部署强烈建议留空**，强制每个访客在网页设置里自带 key，避免共用你的额度 |
| `REDDIT_CLIENT_ID` / `_SECRET` / `_USER_AGENT` | 否 | 仅 `/discover` 灵感页抓 Reddit 时使用 |
| `OSS_REGION` / `OSS_BUCKET` / `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` | 否 | 阿里云 OSS 持久存储。**全部留空 → 禁用，走本地** `data/` （当前行为）；**全部填齐 → 双写本地+OSS，本地缺失时 fallback OSS**。K8s 多副本部署/服务端瘦身/跨副本访问的前提（详见第九节） |
| `OSS_KEY_PREFIX` | 否 | OSS key 前缀，同 bucket 隔离 prod/staging/dev（如 `"prod/"`） |
| `PORT` | 否 | 默认 3000 |
| `NODE_ENV` | 否 | 默认 production（镜像里固定） |

---

## 六、资源建议

| 场景 | CPU | 内存 |
|---|---|---|
| 单机 demo / 内部测试 | 100m | 256Mi |
| 生产单副本（活跃用户 < 100） | 500m | 512Mi |
| 生产多副本 | 按副本数 × 上面值 | 同左 |

Next 16.2 standalone 启动后常驻 200-400MB。build 阶段瞬时尖峰可能到 1GB，**镜像 build 不在 runner 跑**（已分阶段），运行时不需要这么大。

---

## 七、常见故障

| 现象 | 排查 |
|---|---|
| `port-forward` 后页面 502 | `kubectl -n frame-0 describe pod` 看 readiness 是否就绪；20s start-period 之内是正常的 |
| 重启后用户状态丢 | PVC 没挂上 / 挂载点错；检查 `kubectl -n frame-0 get pvc` 状态是否 Bound |
| 「媒体未上传到云端」报错 | Pod 出口被防火墙限制；白名单 `dashscope-instant.oss-cn-hangzhou.aliyuncs.com` 和 `dashscope.aliyuncs.com` |
| Pod OOM | 调高 `resources.limits.memory`；常驻 200-400MB 但首次冷启 + Turbopack JIT 可能短暂尖峰 |
| 镜像构建慢 | 启用 BuildKit cache mount（Dockerfile 里已 `--mount=type=cache`，docker buildx 自动用） |
| 滚动更新失败 | `strategy.type: Recreate` 是预期的——RWO 卷不能多 Pod 同时挂；接受短暂中断 |
| 容器内 EACCES 写 /app/data | PVC 文件系统权限；deployment 已设 `fsGroup: 1001`，但有些 CSI 不尊重 fsGroup，需要在 PV 层 chown 或换支持 fsGroup 的 sc |

---

## 八、文件清单

```
.
├── Dockerfile                  # 多阶段镜像（base/deps/builder/runner）
├── .dockerignore               # 镜像构建上下文过滤
├── docker-compose.yml          # 单机一键起
└── deploy/
    ├── README.md               # 本文件
    └── k8s/
        ├── namespace.yaml
        ├── configmap.yaml      # 非敏感 env
        ├── secret.example.yaml # → 复制为 secret.yaml 后填值（不进 git）
        ├── pvc.yaml            # /app/data 持久卷（默认 RWO 10Gi）
        ├── deployment.yaml     # 单副本 + Recreate 策略
        ├── service.yaml        # ClusterIP
        ├── ingress.yaml        # nginx-ingress 模板
        ├── hpa.yaml            # 默认不启用（详见「多副本」一节）
        └── kustomization.yaml  # 一键 apply 入口
```

---

## 九、OSS 持久存储（推荐生产部署开启）

把 `data/uploads/` 和 `data/videos/` 持久化到阿里云 OSS。**这是 K8s 多副本部署、跨副本访问、备份的前置**。

### 设计：四层渲染冗余，OSS 是最后一层

```
渲染优先级:
  thumbDataUrl (base64 瞬时)
    → IDB localKey (session 全分辨率)
      → /api/uploads/<sha> (本地镜像)
        → OSS 签名 URL (新增：持久兜底)
```

**重要**：OSS 是**新增**一层兜底，**不替换**前三层。所有现有的渲染体验（缩略图秒开、reload 后即时显示）继续保留。`/api/uploads/<sha>` 路由对外签名不变，内部找本地文件失败时 redirect 到 OSS 签名 URL。

### 开启步骤

1. **阿里云控制台** → 对象存储 OSS → 创建 bucket
   - 区域选 **华东 1（杭州）**`oss-cn-hangzhou` —— 和百炼 DashScope 同区，回源最快
   - 读写权限：**私有**（不要 public，凭证泄漏后果严重）
   - 服务端加密：可选 OSS 完全托管（KMS 也行）

2. **创建 AK/SK** —— 推荐子账号 + 仅授该 bucket 的最小权限
   - RAM 控制台 → 用户 → 创建 RAM 用户 → 生成 AccessKey
   - 给权限：自定义策略 `{"Action": ["oss:PutObject","oss:GetObject","oss:HeadObject","oss:DeleteObject","oss:ListObjects"], "Resource": ["acs:oss:*:*:你的bucket名", "acs:oss:*:*:你的bucket名/*"]}`

3. **配 env**（`.env` / K8s Secret 都行）
   ```bash
   OSS_ENABLED=true                    # ← 总开关，默认 false。必须显式 true 才启用
   OSS_REGION=oss-cn-hangzhou
   OSS_BUCKET=frame-0-storage          # ← 改成你的 bucket 名
   OSS_ACCESS_KEY_ID=LTAI5t...
   OSS_ACCESS_KEY_SECRET=...
   OSS_KEY_PREFIX=prod/                # 可选，隔离环境
   ```

   > 为什么有总开关? — 防止运维不小心填了 AK/SK 就**默认**产生 OSS 费用。
   > 必须**先**确认配置正确,**再**显式 `OSS_ENABLED=true`。

4. **验证**（项目启动后看 server log）
   - 启用成功:`[oss] initialized — region=... bucket=... prefix=...`
   - 总开关关:`[oss] disabled (OSS_ENABLED ≠ 'true') — 上传/视频走本地…`
   - 开了但漏填:`[oss] OSS_ENABLED=true 但凭证不完整 — 缺 ... 降级到关闭`

5. （可选）**老数据迁移**：现有 `data/uploads/` 和 `data/videos/` 可以用脚本一次性推到 OSS，之后服务器磁盘就能清空。脚本待补，目前**老数据继续读本地、新数据双写**已经够用。

### 行为

| 配置 | 上传写入 | 视频下载 | `/api/uploads/<sha>` 读取 |
|---|---|---|---|
| **未配** | 本地 `data/uploads/` | 本地 `data/videos/` | 本地，缺失 404 |
| **配齐** | 本地 + OSS sidecar（OSS 失败不阻塞） | 同上 | 本地 → 缺失 fallback 到 OSS 签名 URL (302 redirect, 7 天) |

OSS 端不可达时，本地数据继续可用（**渲染不挂**）。

### 多副本/HPA 启用前提

只有 OSS 配齐后，才能安全做"多副本 + RWX 卷"或"多副本 + 状态全外部化"。否则单个 Pod 的本地 `/app/data` 是孤岛，扩出来的副本看不到别的副本的 uploads/videos。
