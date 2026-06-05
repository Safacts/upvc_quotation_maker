import json
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Read payload size
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        try:
            payload = json.loads(post_data.decode('utf-8'))
            recipient = payload.get('email')
            otp_code = payload.get('otp')
            
            if not recipient or not otp_code:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Missing parameters'}).encode())
                return
            
            # Brevo API Request Payload
            brevo_payload = {
                "sender": { "name": "System Security", "email": "jvenkateshupvc@gmail.com" },
                "to": [{ "email": recipient }],
                "subject": "Your Password Reset OTP",
                "htmlContent": f"""
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 30px; text-align: center; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                    <h2 style="color: #1E3A5F;">Password Reset Request</h2>
                    <p style="color: #475569; font-size: 16px;">We received a request to reset your password for the Venkateshwara UPVC Portal.</p>
                    <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 25px 0; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1E3A5F;">
                      {otp_code}
                    </div>
                    <p style="color: #64748b; font-size: 14px;">Enter this code in the portal to reset your password. If you didn't request this, you can safely ignore this email.</p>
                  </div>
                """
            }
            
            req = urllib.request.Request(
                'https://api.brevo.com/v3/smtp/email',
                data=json.dumps(brevo_payload).encode('utf-8'),
                headers={
                    'accept': 'application/json',
                    'api-key': 'xsmtpsib-c7da6236a6bac47309267b245813ccb7675d526c02236bcdf8666d5adff1c2f8-8p8el8xB45QYLXOw',
                    'content-type': 'application/json'
                },
                method='POST'
            )
            
            with urllib.request.urlopen(req) as response:
                res_body = response.read()
                
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            # Enable CORS for browser access
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True}).encode())
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
