# Copy and paste the entire block below into your EC2 terminal

echo "Starting automated installation of VS Code (code-server)..."

# 1. Install code-server using the official script
curl -fsSL https://code-server.dev/install.sh | sh

# 2. Create configuration directory
mkdir -p ~/.config/code-server

# 3. Configure external access and set default password
cat <<EOF > ~/.config/code-server/config.yaml
bind-addr: 0.0.0.0:8080
auth: password
password: kenxin_secret_2026
cert: false
EOF

# 4. Enable and start the service in the background
sudo systemctl enable --now code-server@$USER

# 5. Output connection information
SERVER_IP=$(curl -s http://checkip.amazonaws.com)
echo ""
echo "Installation and configuration completed successfully."
echo "Access URL: http://$SERVER_IP:8080"
echo "Password: kenxin_secret_2026"
echo "Note: Please ensure port 8080 is open in your AWS EC2 Security Group."
