"use strict";

// API 설정
const ejelAPI = {
  ApiKey: "c96xKsdqBckOV8ePuKqgKyWc-u_65Qz_VnMq7Kx2A7E",
  serverUrl: "http://api-dev.ejelai.com",
};

const ApiKey = ejelAPI.ApiKey;
const SERVER_URL = ejelAPI.serverUrl;

if (!ApiKey || SERVER_URL === "") {
  alert("Please enter your API key and server URL");
}

// DOM 요소
const statusElement = document.querySelector("#status");
const taskInput = document.querySelector("#taskInput");
const removeBGCheckbox = document.querySelector("#removeBGCheckbox");
const idleElement = document.querySelector("#idleElement");
const mediaElement = document.querySelector("#mediaElement");
const canvasElement = document.querySelector("#canvasElement");
const bgCheckboxWrap = document.querySelector("#bgCheckboxWrap");
const bgInput = document.querySelector("#bgInput");

let sessionInfo = null;
let peerConnection = null;
let isVideoPlaying = false;
let mediaCanPlay = false;
let renderID = 0;
let idleVideoUrl = null;

// 초기 상태 업데이트
updateStatus("Please click the new button to create the stream first.");

// 이벤트 리스너
document.querySelector("#newBtn").addEventListener("click", createNewSession);
document.querySelector("#startBtn").addEventListener("click", () => {
  startSessionHandler().then(() => {
    onVideoStatusChange(false);
    showElement(bgCheckboxWrap);
  });
});
document.querySelector("#speakBtn").addEventListener("click", speakHandler);
document
  .querySelector("#closeBtn")
  .addEventListener("click", closeConnectionHandler);
document.querySelector("#chatBtn").addEventListener("click", chatHandler);
removeBGCheckbox.addEventListener("click", handleBGCheckboxToggle);
bgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") renderCanvas();
});

// 상태 업데이트 함수
function updateStatus(message) {
  statusElement.innerHTML += message + "<br>";
  statusElement.scrollTop = statusElement.scrollHeight;
}

// 비디오 상태 변경 처리
function onVideoStatusChange(videoIsPlaying) {
  isVideoPlaying = videoIsPlaying;
  updateStatus(`Video is now ${videoIsPlaying ? "playing" : "idle"}.`);

  if (videoIsPlaying) {
    hideElement(idleElement);
    handleBGCheckboxToggle();
  } else {
    showElement(idleElement);
    hideElement(mediaElement);
    hideElement(canvasElement);
    playIdleVideo();
  }
}

// WebRTC 메시지 처리
function onMessage(event) {
  const message = event.data;
  if (message === "$START$") {
    onVideoStatusChange(true);
  } else if (message === "$END$" || message === "$ERROR$") {
    onVideoStatusChange(false);
  }
}

// 새로운 세션 생성
async function createNewSession() {
  updateStatus("Creating new session... please wait");
  const agent = agentID.value;
  try {
    const [sessionData, idleVideoData] = await Promise.all([
      newSession(agent),
      idleVideo(agent),
    ]);

    sessionInfo = sessionData;
    idleVideoUrl = idleVideoData.idle_video_url;

    const { offer: remoteDescription, ice_servers: iceServers } = sessionInfo;
    peerConnection = new RTCPeerConnection({ iceServers });

    peerConnection.ontrack = handleTrackEvent;
    peerConnection.ondatachannel = handleDataChannelEvent;
    await peerConnection.setRemoteDescription(remoteDescription);

    updateStatus("Session creation completed");
    updateStatus("Now, you can click the start button to start the stream");

    await fetchIdleVideo();
  } catch (error) {
    console.error("Failed to create session or fetch idle video:", error);
    updateStatus("Failed to create session or fetch idle video.");
  }
}

// idle video 다운로드
async function fetchIdleVideo() {
  if (!idleVideoUrl) {
    console.error("Idle video URL is not available");
    return;
  }

  try {
    const response = await fetch(idleVideoUrl);
    if (!response.ok) throw new Error("Network response was not ok");

    const blob = await response.blob();
    idleVideoUrl = URL.createObjectURL(blob);
  } catch (error) {
    console.error("Failed to fetch idle video:", error);
    updateStatus("Failed to fetch idle video");
  }
}

// 세션 시작 및 표시
async function startSessionHandler() {
  if (!sessionInfo) {
    updateStatus("Please create a connection first");
    return;
  }

  updateStatus("Starting session... please wait");

  const localDescription = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(localDescription);

  peerConnection.onicecandidate = handleICECandidateEvent;
  peerConnection.oniceconnectionstatechange = handleICEConnectionStateChange;
  await startSession(sessionInfo.session_id, localDescription);

  peerConnection.getReceivers().forEach((receiver) => {
    receiver.jitterBufferTarget = 500;
  });

  updateStatus("Session started successfully");
  onVideoStatusChange(false);
}

// ICE 후보 처리
function handleICECandidateEvent({ candidate }) {
  if (candidate) {
    handleICE(sessionInfo.session_id, candidate.toJSON());
  }
}

// ICE 연결 상태 변경 처리
function handleICEConnectionStateChange() {
  updateStatus(
    `ICE connection state changed to: ${peerConnection.iceConnectionState}`
  );
}

// 트랙 이벤트 처리
function handleTrackEvent(event) {
  if (event.track.kind === "audio" || event.track.kind === "video") {
    mediaElement.srcObject = event.streams[0];
  }
}

// 데이터 채널 이벤트 처리
function handleDataChannelEvent(event) {
  const dataChannel = event.channel;
  dataChannel.onmessage = onMessage;
}

// 반복 처리기
async function speakHandler() {
  if (!sessionInfo) {
    updateStatus("Please create a connection first");
    return;
  }

  const text = taskInput.value;
  if (text.trim() === "") {
    alert("Please enter a task");
    return;
  }

  updateStatus("Sending task... please wait");
  await speak(sessionInfo.session_id, text);
  updateStatus("Task sent successfully");
}

// 대화 처리기
async function chatHandler() {
  if (!sessionInfo) {
    updateStatus("Please create a connection first");
    return;
  }

  const question = taskInput.value;
  if (question.trim() === "") {
    alert("Please enter a prompt for the LLM");
    return;
  }

  updateStatus("Talking to LLM... please wait");

  try {
    await chat(sessionInfo.session_id, question);
    updateStatus("LLM response sent successfully");
  } catch (error) {
    console.error("Error talking to AI:", error);
    updateStatus("Error talking to AI");
  }
}

// 연결 닫기 처리기
async function closeConnectionHandler() {
  if (!sessionInfo) {
    updateStatus("Please create a connection first");
    return;
  }

  renderID++;
  hideElement(idleElement);
  hideElement(mediaElement);
  hideElement(canvasElement);
  hideElement(bgCheckboxWrap);
  mediaCanPlay = false;

  updateStatus("Closing connection... please wait");
  try {
    peerConnection.close();
    await stopSession(sessionInfo.session_id);
    updateStatus("Connection closed successfully");
  } catch (err) {
    console.error("Failed to close the connection:", err);
  }
}

// 배경 체크박스 토글 처리
function handleBGCheckboxToggle() {
  if (!isVideoPlaying) return;

  const isChecked = removeBGCheckbox.checked;
  if (isChecked) {
    hideElement(mediaElement);
    showElement(canvasElement);
    renderCanvas();
  } else {
    hideElement(canvasElement);
    showElement(mediaElement);
  }
}

// idle 영상 요청
async function idleVideo(agent_id) {
  const sessionResponse = await fetchRequest(
    "GET",
    `/streams/idle-video/${agent_id}`
  );

  const data = await handleFetchResponse(sessionResponse);
  return data;
}

// 새로운 세션 요청
async function newSession(agent_id) {
  const sessionResponse = await fetchRequest("POST", "/streams", {
    agent_id: agent_id,
  });

  const data = await handleFetchResponse(sessionResponse);
  return data;
}

// 세션 시작 요청
async function startSession(session_id, sdp) {
  const response = await fetchRequest("POST", "/streams/sdp", {
    session_id: session_id,
    answer: sdp,
  });

  await handleFetchResponse(response);
}

// ICE 후보 요청
async function handleICE(session_id, candidate) {
  await fetchRequest("POST", "/streams/ice-candidates", {
    session_id: session_id,
    candidate: candidate,
  });
}

// 텍스트 반복 요청
async function speak(session_id, text) {
  const response = await fetchRequest("POST", "/streams/speakings", {
    session_id: session_id,
    text: text,
    background_color: "#000000",
  });

  await handleFetchResponse(response);
}

// 대화 요청
async function chat(session_id, question) {
  const response = await fetchRequest("POST", "/streams/chats", {
    session_id: session_id,
    question: question,
    background_color: "#000000",
  });

  await handleFetchResponse(response);
}

// 세션 중지 요청
async function stopSession(session_id) {
  const response = await fetchRequest("DELETE", "/streams", {
    session_id: session_id,
  });

  const data = await handleFetchResponse(response);
  return data;
}

// 공통 fetch 요청 함수
async function fetchRequest(method, endpoint, body = null) {
  const url = `${SERVER_URL}${endpoint}`;
  const options = {
    method: method,
    headers: {
      "x-api-key": ApiKey,
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  return fetch(url, options);
}

// fetch 응답 처리 함수
async function handleFetchResponse(response) {
  if (response.status === 500) {
    console.error("Server error");
    updateStatus(
      "Server Error. Please ask the staff if the service has been turned on"
    );
    throw new Error("Server error");
  }
  const data = await response.json();
  return data;
}

// 요소 숨김
function hideElement(element) {
  element.classList.add("hide");
  element.classList.remove("show");
}

// 요소 표시
function showElement(element) {
  element.classList.add("show");
  element.classList.remove("hide");
}

// idle 비디오 재생
function playIdleVideo() {
  idleElement.src = idleVideoUrl;
  idleElement.loop = true;
  idleElement.play().catch(console.error);
}

// 비디오 배경 처리
function renderCanvas() {
  if (!removeBGCheckbox.checked) return;
  hideElement(mediaElement);
  showElement(canvasElement);
  canvasElement.classList.add("show");

  const ctx = canvasElement.getContext("2d", { willReadFrequently: true });
  canvasElement.parentElement.style.background = bgInput.value?.trim() || "";

  const curRenderID = ++renderID;

  function processFrame() {
    if (curRenderID !== renderID || !removeBGCheckbox.checked) return;

    canvasElement.width = mediaElement.videoWidth;
    canvasElement.height = mediaElement.videoHeight;

    ctx.drawImage(
      mediaElement,
      0,
      0,
      canvasElement.width,
      canvasElement.height
    );
    const imageData = ctx.getImageData(
      0,
      0,
      canvasElement.width,
      canvasElement.height
    );
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      if (isCloseToGreen(data.slice(i, i + 3))) {
        data[i + 3] = 0;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    requestAnimationFrame(processFrame);
  }

  processFrame();
}

// 색상 확인 함수(초록색 배경을 투명으로 변경)
function isCloseToGreen([red, green, blue]) {
  return green > 90 && red < 90 && blue < 90;
}

// DOM 요소 초기 설정
mediaElement.onloadedmetadata = () => {
  mediaCanPlay = true;
  mediaElement.play();
};
