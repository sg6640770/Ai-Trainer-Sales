const BASE = "/api";

function getToken() {
  return localStorage.getItem("access_token");
}

async function request(method, path, body = null, auth = true) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

export const api = {
  login: (email, password) => request("POST", "/login", { email, password }, false),
  signup: (payload) => request("POST", "/signup", payload, false),

  getTrainees: (instituteId) => request("GET", `/trainees/${instituteId}`),
  createTrainee: (payload) => request("POST", "/create-trainee", payload),
  createInstitute: (payload) => request("POST", "/create-institute", payload),
  getInstitute: (id) => request("GET", `/institute/${id}`),

  startSimulation: (payload) => request("POST", "/start-simulation", payload),
  endSimulation: (simulationId) => request("POST", "/end-simulation", { simulation_id: simulationId }),
  getSimulations: (traineeId) => request("GET", `/simulations/${traineeId}`),

  addMessage: (payload) => request("POST", "/add-message", payload),
  getMessages: (simId) => request("GET", `/messages/${simId}`),

  addFeedback: (payload) => request("POST", "/add-feedback", payload),
  getFeedback: (simId) => request("GET", `/feedback/${simId}`),

  traineeDashboard: (traineeId, page = 1) => request("GET", `/trainee-dashboard/${traineeId}?page=${page}`),
  managerDashboard: (instituteId, traineePage = 1, sessionPage = 1) => request("GET", `/manager-dashboard/${instituteId}?trainee_page=${traineePage}&session_page=${sessionPage}`),
};