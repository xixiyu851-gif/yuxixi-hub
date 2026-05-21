# 黄金报价网页

这是一个可部署为静态站点的黄金报价看板，适合生成公网链接后在微信中打开。

## 本地预览

```bash
cd gold-quote
python3 -m http.server 4173
```

打开：

```text
http://localhost:4173
```

## 微信链接

微信不能访问你电脑上的 `localhost`，需要把 `gold-quote` 目录部署到公网 HTTPS 静态托管服务，例如 GitHub Pages、Vercel、Netlify、Cloudflare Pages 或服务器 Nginx。

部署后得到类似下面的链接，就可以直接发到微信里打开：

```text
https://你的域名/gold-quote/
```

## 数据

- 黄金现货价：`https://api.gold-api.com/price/XAU`
- 汇率：`https://api.frankfurter.app/latest?from=USD&to=CNY`
- 日内区间补充：Stooq，通过代理尝试获取；失败时页面会用主报价估算区间并显示缓存/备用状态。

页面报价仅作展示参考，不构成投资建议。
