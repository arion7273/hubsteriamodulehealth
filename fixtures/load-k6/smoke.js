import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 2,
  duration: '3s',
  thresholds: {
    http_req_duration: ['p(95)<200'],
  },
};

export default function () {
  const base = __ENV.BASE_URL || 'http://127.0.0.1:4177';
  const res = http.get(`${base}/fixtures/defect-app/delayed-render.html`);
  check(res, { 'status is 200': (r) => r.status === 200 });
}
