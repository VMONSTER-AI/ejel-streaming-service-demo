# EJEL STREAMING DEMO BY VMONSTER EJEL

## 설정

- index.js 내부의, api / apiKey 설정

## 실행

```shell script
$ node app.js
```

- 서버는 localhost:3000 으로 실행됩니다.
- Connect 버튼 : 스트림을 생성하고, 세션을 연결합니다. status 를 통해 상태를 확인할 수 있습니다.
- Start 버튼 : 입력한 대본을 기반으로 실시간으로 대본을 읽어주는 영상을 생성할 수 있습니다.

## 주의사항

- Connect 이후, 1분간 API 요청이 진행되지 않으면 Connection 이 종료됩니다.
