package com.dms.tools;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;

public class DBInspector {

    public static void main(String[] args) throws Exception {
        String url;
        String user;
        String pass;
        if (args.length >= 3) {
            url = args[0];
            user = args[1];
            pass = args[2];
        } else {
            url = System.getProperty("db.url", "jdbc:mysql://localhost:3306/DMS?useSSL=false");
            user = System.getProperty("db.user", "root");
            pass = System.getProperty("db.pass", "changeme");
            System.out.println("Using system properties for DB connection (db.url/db.user/db.pass)");
        }

        System.out.println("Connecting to: " + url);
        try (Connection conn = DriverManager.getConnection(url, user, pass)) {
            System.out.println("Connected successfully.");

            try (Statement st = conn.createStatement()) {
                System.out.println("\nTables:");
                try (ResultSet rs = st.executeQuery("SHOW TABLES")) {
                    while (rs.next()) {
                        System.out.println(" - " + rs.getString(1));
                    }
                }

                // Try common user table names
                String[] candidates = new String[] {"app_user", "app_users", "users", "user", "dms_app_users"};
                for (String tbl : candidates) {
                    try {
                        try (ResultSet rs = st.executeQuery("SELECT * FROM `" + tbl + "` LIMIT 5")) {
                            ResultSetMetaData md = rs.getMetaData();
                            int cols = md.getColumnCount();
                            System.out.println("\nFound table: " + tbl + " (showing up to 5 rows)");
                            while (rs.next()) {
                                StringBuilder sb = new StringBuilder();
                                for (int i = 1; i <= cols; i++) {
                                    if (i > 1) sb.append(" | ");
                                    sb.append(md.getColumnLabel(i)).append("=").append(rs.getString(i));
                                }
                                System.out.println(sb.toString());
                            }
                        }
                        // If query succeeded, stop checking other names
                        break;
                    } catch (Exception e) {
                        // ignore and try next candidate
                    }
                }
            }
        } catch (Exception ex) {
            System.err.println("Database access error: " + ex.getMessage());
            ex.printStackTrace(System.err);
            System.exit(1);
        }
    }
}
