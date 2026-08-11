package com.dms.tools;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;

public class UserFetcher {
    public static void main(String[] args) throws Exception {
        String url = System.getProperty("db.url", "jdbc:mysql://localhost:3306/dms?useSSL=false&allowPublicKeyRetrieval=true");
        String user = System.getProperty("db.user", "root");
        String pass = System.getProperty("db.pass", "changeme");
        String username = args.length > 0 ? args[0] : System.getProperty("db.username", "gloria");

        System.out.println("Connecting to: " + url);
        try (Connection conn = DriverManager.getConnection(url, user, pass)) {
            System.out.println("Connected.");
            String sql = "SELECT * FROM app_users WHERE username = ? LIMIT 1";
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setString(1, username);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) {
                        System.out.println("No user found with username='" + username + "'");
                        return;
                    }
                    ResultSetMetaData md = rs.getMetaData();
                    int cols = md.getColumnCount();
                    System.out.println("User row for '" + username + "':");
                    for (int i = 1; i <= cols; i++) {
                        String col = md.getColumnLabel(i);
                        String val = rs.getString(i);
                        System.out.println(" - " + col + " = " + (val == null ? "<null>" : val));
                    }
                }
            }
        } catch (Exception ex) {
            System.err.println("DB error: " + ex.getMessage());
            ex.printStackTrace(System.err);
            System.exit(1);
        }
    }
}
