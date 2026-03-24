import java.sql.*;
public class VerifyFolderRunner {
  public static void main(String[] args) throws Exception {
    String name = args[0];
    try (Connection c = DriverManager.getConnection("jdbc:mysql://localhost:3306/dms?useSSL=false", "root", "P@ssw0rd");
         PreparedStatement ps = c.prepareStatement("SELECT id, name, parent_id FROM document_folders WHERE name = ?")) {
      ps.setString(1, name);
      try (ResultSet rs = ps.executeQuery()) {
        int count = 0;
        while (rs.next()) {
          count++;
          System.out.println("dbRow id=" + rs.getLong("id") + ", name=" + rs.getString("name") + ", parent_id=" + rs.getString("parent_id"));
        }
        System.out.println("dbCount=" + count);
      }
    }
  }
}
