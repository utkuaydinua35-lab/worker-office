# Yayına alma — hasbihal.bernzcompany.com

Bu rehber uygulamayı kendi sunucunuzda (VPS), kendi alan adınızla ve HTTPS ile yayınlar. Birkaç arkadaşın kullanacağı bir sunucu için tasarlandı.

İki yol var:

- **Cloudflare Tunnel ile** (alan adı Cloudflare'de ve VPS'te zaten bir tünel varsa önerilir): hiçbir port açılmaz, ses LiveKit Cloud'dan geçer. Bkz. [Cloudflare Tunnel ile](#cloudflare-tunnel-ile).
- **Doğrudan** (aşağıdaki 1–7. adımlar): Caddy HTTPS'i, LiveKit sesi sunucunuzda çalıştırır; 80, 443 ve medya portları açılır.

## Neyin dışarıya açık olduğu

| Ne | Nereden erişilir |
| -- | ---------------- |
| Caddy (HTTPS, sertifikayı kendisi alır ve yeniler) | İnternet: 80, 443 |
| LiveKit ses/görüntü medyası | İnternet: 7881/tcp, 50000–50100/udp |
| Uygulama (Next.js + Socket.io + müzik botu) | Yalnızca sunucunun içi: `127.0.0.1:3000` |
| LiveKit API | Yalnızca sunucunun içi: `127.0.0.1:7880` (`/rtc` yolu Caddy üzerinden) |
| PostgreSQL | Yalnızca sunucunun içi: `127.0.0.1:5432` |

**Sunucudaki diğer dosyalar neden sızmaz:**

- Uygulama bir Docker konteynerinde, ayrıcalıksız `node` kullanıcısıyla, hiçbir Linux yetkisi olmadan (`cap_drop: ALL`) çalışır.
- Konteyner sunucunun dosya sistemini görmez. Yalnızca kendi `uploads` deposuna yazabilir.
- İmaj yalnızca `discord-clone/` klasöründen derlenir. Reponun geri kalanı, `.env` dosyaları ve yüklenen dosyalar imaja girmez (`.dockerignore`).
- Caddy diskten dosya sunmaz; yalnızca uygulamaya ve LiveKit'in `/rtc` yoluna iletir.
- Uygulamanın dosya sunan tek rotası (`/uploads/...`) yalnızca kendi ürettiği dosya adlarını kabul eder; `../` gibi denemeler 404 döner.
- Gizli anahtarlar yalnızca sunucudaki `deploy/.env` dosyasındadır ve git'e girmez.

En temiz yol bu uygulamayı **ayrı bir VPS'te** çalıştırmaktır. Aynı makinede başka işler de varsa, yukarıdaki kurallar sayesinde konteyner onların dosyalarına erişemez. Yine de ayrı makine en sağlam sınırdır.

## 1. Sunucu

Ubuntu 24.04 kurulu bir VPS. 2 vCPU / 4 GB RAM birkaç kişi için yeterli (örneğin Hetzner CX22, DigitalOcean 4 GB). Sunucunun **IPv4 adresini** not edin.

Ev bilgisayarından yayınlamak mümkün ama önerilmez: ev IP'si değişir, modemde birçok port yönlendirmek gerekir.

## 2. DNS

`bernzcompany.com`'un DNS panelinde bir kayıt ekleyin:

| Tür | Ad | Değer |
| --- | -- | ----- |
| A | `hasbihal` | sunucunun IPv4 adresi |

Yayılması birkaç dakika sürebilir. Kontrol etmek için (Mac'te): `dig +short hasbihal.bernzcompany.com` sunucunun IP'sini göstermeli.

## 3. Sunucuyu hazırlama

Sunucuya bağlanın (`ssh root@SUNUCU_IP`) ve sırayla çalıştırın:

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw allow 7881/tcp
ufw allow 50000:50100/udp
ufw --force enable
mkdir -p /opt/hasbihal
```

## 4. Kodu sunucuya gönderme

Kendi Mac'inizde, `worker-office` klasöründeyken. Yalnızca `discord-clone` gönderilir; `.env`, `node_modules` ve yüklenen dosyalar gitmez:

```bash
rsync -av --delete --exclude node_modules --exclude .next --exclude uploads --exclude .env --exclude deploy/.env --exclude prisma/migrations ./discord-clone/ root@SUNUCU_IP:/opt/hasbihal/
```

## 5. Ayarlar

Sunucuda:

```bash
cd /opt/hasbihal/deploy
cp .env.example .env
openssl rand -base64 32 | tr -d '/+='
```

Son komutu üç kez çalıştırıp çıkan üç farklı değeri `.env` dosyasına (`nano .env`) yazın:

- `NEXTAUTH_SECRET=` → 1. değer
- `POSTGRES_PASSWORD=` → 2. değer
- `LIVEKIT_API_SECRET=` → 3. değer
- `DOMAIN=hasbihal.bernzcompany.com` (zaten yazılı)
- `REGISTRATION_CODE=` → arkadaşlarınıza vereceğiniz bir kayıt kodu, örneğin `bernz-ekip-2026`. **Boş bırakmayın**; boşsa sitenizi bulan herkes kayıt olabilir.

Sonra dosyayı yalnızca root'un okuyabileceği hale getirin:

```bash
chmod 600 .env
```

## 6. Başlatma

```bash
cd /opt/hasbihal/deploy
docker compose up -d --build
```

İlk derleme birkaç dakika sürer. Durumu görmek için:

```bash
docker compose ps
docker compose logs -f app
```

`> Hazır: http://127.0.0.1:3000 (production)` satırını görünce https://hasbihal.bernzcompany.com adresini açın. Caddy sertifikayı ilk istekte alır; ilk açılış birkaç saniye sürebilir.

## 7. Kullanım

1. Kayıt olun (kayıt kodunu girerek) ve bir sunucu oluşturun.
2. Sunucu menüsünden **İnsanları Davet Et** ile bağlantıyı alın.
3. Arkadaşlarınıza davet bağlantısını ve kayıt kodunu gönderin.

## Güncelleme

Mac'te 4. adımdaki `rsync` komutunu tekrar çalıştırın, sonra sunucuda:

```bash
cd /opt/hasbihal/deploy
docker compose up -d --build
```

Müzik botu YouTube'da "bulunamadı" ya da 403 hatası vermeye başlarsa yt-dlp eskimiştir. İmajı önbelleksiz yeniden derleyin:

```bash
cd /opt/hasbihal/deploy
docker compose build --no-cache app
docker compose up -d
```

## Yedekleme

Veritabanı:

```bash
cd /opt/hasbihal/deploy
docker compose exec -T db pg_dump -U hasbihal hasbihal > /root/hasbihal-$(date +%F).sql
```

Yüklenen dosyalar `hasbihal_uploads` Docker deposundadır:

```bash
docker run --rm -v hasbihal_uploads:/data -v /root:/backup alpine tar czf /backup/uploads-$(date +%F).tgz -C /data .
```

## Sorun giderme

- **Site açılmıyor / sertifika hatası:** DNS kaydı sunucunun IP'sini gösteriyor mu, 80 ve 443 açık mı? `docker compose logs caddy`.
- **Ses kanalına girilemiyor ya da kimse duyulmuyor:** 7881/tcp ve 50000–50100/udp güvenlik duvarında (VPS sağlayıcısının panelindeki güvenlik duvarı dahil) açık mı? `docker compose logs livekit`.
- **Müzik botu çalmıyor:** `docker compose logs app`. YouTube hatalarında yukarıdaki yt-dlp güncellemesini yapın.

## Cloudflare Tunnel ile

Alan adı Cloudflare'deyse ve VPS'te `cloudflared` çalışıyorsa bu yol daha basit ve daha kapalıdır:

- Sunucuda **hiçbir port açılmaz**, güvenlik duvarına dokunulmaz. Uygulama yalnızca `127.0.0.1:3000`'de yayınlanır; tünel onu oradan alır.
- PostgreSQL hiçbir porttan yayınlanmaz; yalnızca uygulama konteyneri ona ulaşır.
- HTTPS'i Cloudflare sağlar, Caddy kullanılmaz.
- Ses ve görüntü **LiveKit Cloud**'dan geçer, çünkü tünel WebRTC'nin UDP trafiğini taşıyamaz.

Dosya: `deploy/docker-compose.tunnel.yml`. Her `docker compose` komutuna `-f docker-compose.tunnel.yml` eklenir.

1. https://cloud.livekit.io adresinde bir proje açın; proje adresini (`wss://...livekit.cloud`), API key ve secret'ı alın.
2. Kodu sunucuya gönderin (4. adım) ve `.env`'i hazırlayın (5. adım). `LIVEKIT_API_KEY` ve `LIVEKIT_API_SECRET` LiveKit Cloud'dakiler olsun, `LIVEKIT_URL` satırının başındaki `#`'i kaldırıp proje adresini yazın.
3. Başlatın:
   ```bash
   cd /opt/hasbihal/deploy
   docker compose -f docker-compose.tunnel.yml up -d --build
   ```
4. Cloudflare Zero Trust'ta tünelin published application ayarı: Service URL `http://127.0.0.1:3000`. `localhost` yazmayın; bazı sistemlerde IPv6'ya çözülüp 502 verir.

`cloudflared` sunucuda bir sistem servisi olarak çalışmalı (`systemctl status cloudflared`). Docker konteyneri olarak çalışıyorsa `127.0.0.1` konteynerin kendisidir; o durumda iki konteyneri aynı Docker ağına bağlayın ve adresi ona göre verin.

Açıp kapatma:

```bash
docker compose -f docker-compose.tunnel.yml stop
docker compose -f docker-compose.tunnel.yml start
```

`stop` ile kapatılan uygulama, sunucu yeniden başlasa da kapalı kalır. Veriler (mesajlar, hesaplar, yüklenen dosyalar) silinmez.
