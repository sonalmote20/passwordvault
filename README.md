# 🔐 Secure Password Vault

A simple web application to securely store and manage passwords using encryption, Docker, and MongoDB.

## 📌 Problem Statement
Managing multiple passwords can be difficult. This project provides a local dashboard to store, view, search, and delete credentials securely.

## 🚀 Features
- Add and delete saved passwords
- Search and filter credentials
- Show and hide passwords
- Generate strong passwords
- Dark and light mode toggle
- Encrypt passwords before storing them
- Run using Docker containers

## 🛠️ Technologies Used
- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Python Flask
- **Database:** MongoDB
- **Encryption:** Python Cryptography
- **Containerization:** Docker and Docker Compose

## 🏗️ Architecture
The project uses three containers:

1. **Frontend:** Displays the password vault dashboard.
2. **Backend:** Handles requests and encrypts passwords.
3. **MongoDB:** Stores encrypted credentials.

Docker Compose connects and manages all three services.

## ⚙️ How to Run

1. Install Docker Desktop.
2. Clone the repository:

   ```bash
   git clone https://github.com/sonalmote20/passwordvault.git
   ```

3. Open the project folder:

   ```bash
   cd passwordvault
   ```

4. Create a `.env` file and set `MONGO_PASSWORD` to a strong development password.

5. Start the application:

   ```bash
   docker compose up --build -d
   ```

6. Open your browser:

   http://localhost:8080

## 🔒 Security
Saved passwords are encrypted before being stored in MongoDB. The master password is verified using a one-way password hash.

**Note:** This project is intended for educational purposes and is not a production-ready password manager.

## 👩‍💻 Author
**Sonal Mote**

## 📄 License
This project is available for educational and learning purposes.
