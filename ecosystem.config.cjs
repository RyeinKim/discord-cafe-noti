// pm2 상주 설정(Docker 안 쓰고 PC/라즈베리파이에서 직접 돌릴 때).
// Docker로 돌릴 경우엔 compose의 restart 정책을 쓰므로 이 파일은 불필요.
module.exports = {
  apps: [
    {
      name: 'discord-cafe-noti',
      script: 'src/index.js',
      instances: 1, // 다중 인스턴스 금지(종합 중복 게시/파일 경쟁 방지)
      exec_mode: 'fork',
      time: true, // 로그 타임스탬프
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s', // 30초 미만 생존은 실패로 카운트
      restart_delay: 5000, // 크래시 후 5초 대기(빠른 재시작 루프 방지)
      env: {
        TZ: 'Asia/Seoul',
      },
    },
  ],
};
