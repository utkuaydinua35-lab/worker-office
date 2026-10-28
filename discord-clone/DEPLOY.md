# Yayına alma — hasbihal.bernzcompany.com

Hasbihal, mağazanın çalıştığı sunucuya (`91.132.49.107`) kurulur ve istendiğinde açılıp kapatılır. Kurulum mağazaya dokunmayacak şekilde tasarlandı.

Her komut bloğunun üstünde hangi makinede çalıştırılacağı yazar: **Mac'te** ya da **Sunucuda**. Sunucu komutları, `docker` çalıştırma yetkisi olan bir kullanıcıyla (root ya da `docker` grubunda) çalıştırılır; değilseniz `docker` komutlarının başına `sudo` ekleyin.

## Mağazaya neden dokunmaz

| Ne | Nerede |
| -- | ------ |
| Uygulama (Next.js + Socket.io + müzik botu) | `127.0.0.1:3000`, yalnızca sunucunun içinden. Cloudflare tüneli buradan alır. |
| Hasbihal'in kendi PostgreSQL'i | `127.0.0.1:5433`, yalnızca sunucunun içinden. Mağazanın 5432'si kullanılmaz. |
| HTTPS | Cloudflare tüneli. nginx'e ve 80/443'e dokunulmaz, Caddy yok. |
| Ses ve görüntü | LiveKit Cloud. Sunucuda port açılmaz. |
| Güvenlik duvarı (ufw) | Değişmez. |

- Uygulama konteyneri en fazla **700 MB bellek ve 2 CPU** kullanabilir; mağazanın payı korunur.
- Konteynerler kendi Docker ağındadır. Mağazanın yalnızca sunucu içinde (`127.0.0.1`) dinleyen servislerine ulaşamaz, sunucunun dosya sistemini görmez.
- Uygulama ayrıcalıksız `node` kullanıcısıyla, hiçbir Linux yetkisi olmadan (`cap_drop: ALL`) çalışır ve yalnızca kendi `uploads` deposuna yazabilir.
- İmaj yalnızca `discord-clone/` klasöründen derlenir. Reponun geri kalanı, `.env` dosyaları ve yüklenen dosyalar imaja girmez (`.dockerignore`).
- Uygulamanın dosya sunan tek rotası (`/uploads/...`) yalnızca kendi ürettiği dosya adlarını kabul eder.
- Güvenlik başlıkları (HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) uygulamanın kendisinden gelir (`next.config.mjs`).
- Giriş ve kayıt denemeleri sınırlıdır:
  - Giriş: aynı IP'den 15 dakikada en fazla 20 deneme.
  - Giriş: aynı e-postaya 15 dakikada en fazla 10 hatalı deneme.
  - Kayıt: aynı IP'den saatte en fazla 5 deneme (yanlış kayıt kodları dahil).

## Ön kontrol

**Sunucuda:** 3000 ve 5433 portları boş olmalı. Bu komut hiçbir şey yazmamalı:

```bash
sudo ss -ltnp | grep -E ':(3000|5433) '
```

**Sunucuda:** tünel çalışıyor olmalı (`active (running)`):

```bash
systemctl status cloudflared
```

**Sunucuda:** Docker kurulu olmalı:

```bash
docker compose version
```

Kurulu değilse **sunucuda**:

```bash
curl -fsSL https://get.docker.com | sudo sh
```

Docker kurulumu nginx'i ya da mağazayı yeniden başlatmaz. Docker'ın yayınladığı portlar ufw'yi atlar; burada yalnızca `127.0.0.1` üzerinde port yayınlandığı için dışarıya bir şey açılmaz.

## 1. LiveKit Cloud

https://cloud.livekit.io adresinde bir proje açın. **Settings → Keys** bölümünden proje adresini (`wss://...livekit.cloud`), API key ve API secret'ı alın.

## 2. Cloudflare tüneli

Cloudflare Zero Trust'ta tünelin published application ayarı:

- Subdomain: `hasbihal`, Domain: `bernzcompany.com`
- Service URL: `http://localhost:3000`

## 3. Klasör

**Sunucuda:**

```bash
sudo mkdir -p /opt/hasbihal
```

**Sunucuda:**

```bash
sudo chown $USER /opt/hasbihal
```

## 4. Kodu sunucuya gönderme

**Mac'te**, `worker-office` klasöründe. Yalnızca `discord-clone` gönderilir; `.env`, `node_modules` ve yüklenen dosyalar gitmez. `/uploads` başındaki `/` önemlidir: yalnızca en üstteki `uploads` klasörünü dışarıda bırakır; onsuz, dosyaları sunan `src/app/uploads` rotası da gönderilmez ve resimler 404 verir. `KULLANICI` yerine sunucudaki kullanıcı adınızı yazın:

```bash
rsync -av --delete --exclude node_modules --exclude .next --exclude /uploads --exclude .env --exclude deploy/.env --exclude prisma/migrations ./discord-clone/ KULLANICI@91.132.49.107:/opt/hasbihal/
```

## 5. Ayarlar

**Sunucuda:**

```bash
cd /opt/hasbihal/deploy && cp .env.example .env
```

**Sunucuda**, iki kez çalıştırıp iki farklı değer alın:

```bash
openssl rand -base64 32 | tr -d '/+='
```

**Sunucuda:**

```bash
nano /opt/hasbihal/deploy/.env
```

- `NEXTAUTH_SECRET=` → 1. değer
- `POSTGRES_PASSWORD=` → 2. değer
- `LIVEKIT_URL=`, `LIVEKIT_API_KEY=`, `LIVEKIT_API_SECRET=` → LiveKit Cloud'dan
- `REGISTRATION_CODE=` → arkadaşlarınıza vereceğiniz kayıt kodu. **Boş bırakmayın**; boşsa siteyi bulan herkes kayıt olabilir.

Ctrl+O, Enter, Ctrl+X ile kaydedin. Sonra **sunucuda**:

```bash
chmod 600 /opt/hasbihal/deploy/.env
```

## 6. Derleme — yoğunluğun az olduğu saatte

Derleme birkaç dakika boyunca CPU'yu ve 1–1,5 GB belleği kullanır. 700 MB / 2 CPU sınırı yalnızca çalışan uygulama içindir, derlemeye uygulanmaz. Bu yüzden derlemeyi mağazanın sakin olduğu bir saatte (örneğin gece) yapın.

**Sunucuda**, önce yeterli boş bellek olduğuna bakın (`available` sütunu 1,5 GB'tan fazla olmalı):

```bash
free -h
```

**Sunucuda:**

```bash
cd /opt/hasbihal/deploy && docker compose build
```

## 7. Başlatma

**Sunucuda** (derleme bittikten sonra; bu adım hızlıdır):

```bash
cd /opt/hasbihal/deploy && docker compose up -d
```

**Sunucuda**, kayıtları izlemek için:

```bash
cd /opt/hasbihal/deploy && docker compose logs -f app
```

`> Hazır: http://0.0.0.0:3000 (production)` satırını görünce Ctrl+C ile çıkın (uygulama çalışmaya devam eder) ve https://hasbihal.bernzcompany.com adresini açın.

## 8. Kullanım

1. Kayıt olun (kayıt kodunu girerek) ve bir sunucu oluşturun.
2. Sunucu menüsünden **İnsanları Davet Et** ile bağlantıyı alın.
3. Arkadaşlarınıza davet bağlantısını ve kayıt kodunu gönderin.

## Açma ve kapatma

**Sunucuda**, kapatmak için:

```bash
cd /opt/hasbihal/deploy && docker compose stop
```

**Sunucuda**, açmak için:

```bash
cd /opt/hasbihal/deploy && docker compose start
```

Kapalıyken sunucu yeniden başlasa da kapalı kalır. Mesajlar, hesaplar ve yüklenen dosyalar silinmez. Açmak derleme gerektirmez, saniyeler sürer.

## Güncelleme

**Mac'te**, 4. adımdaki `rsync` komutunu tekrar çalıştırın.

**Sunucuda**, yoğunluğun az olduğu saatte:

```bash
cd /opt/hasbihal/deploy && docker compose build
```

**Sunucuda:**

```bash
cd /opt/hasbihal/deploy && docker compose up -d
```

Müzik botu YouTube'da "bulunamadı" ya da 403 hatası vermeye başlarsa yt-dlp eskimiştir. **Sunucuda**, yoğunluğun az olduğu saatte imajı önbelleksiz derleyin, sonra yukarıdaki `docker compose up -d` komutunu çalıştırın:

```bash
cd /opt/hasbihal/deploy && docker compose build --no-cache app
```

## Yedekleme

**Sunucuda**, veritabanı:

```bash
cd /opt/hasbihal/deploy && docker compose exec -T db pg_dump -U hasbihal hasbihal > ~/hasbihal-$(date +%F).sql
```

**Sunucuda**, yüklenen dosyalar (`hasbihal_uploads` Docker deposu):

```bash
docker run --rm -v hasbihal_uploads:/data -v "$HOME":/backup alpine tar czf /backup/uploads-$(date +%F).tgz -C /data .
```

## Sorun giderme

- **502 hatası.** Önce uygulamanın çalıştığını kontrol edin; **sunucuda** `cd /opt/hasbihal/deploy && docker compose ps` komutu `app` için `running` göstermeli, `curl -I http://127.0.0.1:3000/login` komutu `200 OK` vermeli. Bunlar tamamsa ve 502 sürüyorsa tünelin Service URL'sini `http://127.0.0.1:3000` yapın: Docker portu yalnızca IPv4'te yayınlar, `localhost` bazı sistemlerde önce IPv6'ya (`::1`) gider.
- **Ses kanalına girilemiyor.** **Sunucuda** `docker compose logs app` çıktısında `LiveKit'e ulaşılamıyor` satırı varsa `.env`'deki `LIVEKIT_URL` ya da anahtarlar yanlıştır. Düzelttikten sonra `docker compose up -d` yeterli; derleme gerekmez.
- **Uygulama sürekli yeniden başlıyor.** `docker compose ps` çıktısında `restarting` görünüyorsa `docker compose logs app` çıktısına bakın. Bellek sınırına takılıyorsa `docker-compose.yml`'deki `mem_limit` değerini yükseltin.
- **Müzik botu çalmıyor.** `docker compose logs app`. YouTube hatalarında yukarıdaki yt-dlp güncellemesini yapın.
