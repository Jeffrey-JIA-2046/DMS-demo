-- MySQL dump 10.13  Distrib 8.0.19, for Win64 (x86_64)
--
-- Host: localhost    Database: dms
-- ------------------------------------------------------
-- Server version	9.1.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `app_users`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `app_users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `display_name` varchar(160) NOT NULL,
  `role` enum('DOC_ADMIN','DOC_VIEWER','SYS_ADMIN','USER_ADMIN') NOT NULL,
  `username` varchar(120) NOT NULL,
  `user_password` varchar(255) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKspsnwr241e9k9c8p5xl4k45ih` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `audit_logs`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `action` varchar(255) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `details` varchar(1024) DEFAULT NULL,
  `document_id` bigint DEFAULT NULL,
  `performed_by` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `document_approval_notes`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_approval_notes` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `note` varchar(2000) NOT NULL,
  `author_id` bigint NOT NULL,
  `document_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKkowkw2b4q9en8t3qm2w4q4mi0` (`author_id`),
  KEY `FKopqm2fr5wst35n56iks6kpgo2` (`document_id`),
  CONSTRAINT `FKkowkw2b4q9en8t3qm2w4q4mi0` FOREIGN KEY (`author_id`) REFERENCES `app_users` (`id`),
  CONSTRAINT `FKopqm2fr5wst35n56iks6kpgo2` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `document_folders`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_folders` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `parent_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKl4dk7acjlsijbubq8t5akwcjd` (`name`,`parent_id`),
  KEY `FKt577p6r1vgs7afkkbgpiv46y8` (`parent_id`),
  CONSTRAINT `FKt577p6r1vgs7afkkbgpiv46y8` FOREIGN KEY (`parent_id`) REFERENCES `document_folders` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `document_metadata_values`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_metadata_values` (
  `document_id` bigint NOT NULL,
  `field_value` varchar(1024) DEFAULT NULL,
  `field_key` varchar(64) NOT NULL,
  PRIMARY KEY (`document_id`,`field_key`),
  CONSTRAINT `FKimeiktj2yofpiu0ju8mkfievh` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `document_reminder_rules`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_reminder_rules` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `category` varchar(128) NOT NULL,
  `date_column` varchar(32) NOT NULL,
  `direction` varchar(16) NOT NULL,
  `offset_value` int NOT NULL,
  `offset_unit` varchar(16) NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `document_retention_rules`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_retention_rules` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `category` varchar(128) NOT NULL,
  `date_basis` varchar(32) NOT NULL,
  `years_to_retain` int NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `document_tags`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_tags` (
  `document_id` bigint NOT NULL,
  `tag` varchar(60) DEFAULT NULL,
  KEY `FKc99c5qjulwx9gru07yrhicgd2` (`document_id`),
  CONSTRAINT `FKc99c5qjulwx9gru07yrhicgd2` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `document_versions`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_versions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `content` longblob,
  `content_type` varchar(90) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `size_bytes` bigint NOT NULL,
  `version_number` int NOT NULL,
  `document_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FKi6p7dgv96b8s8ivf84hqo9pt` (`document_id`),
  CONSTRAINT `FKi6p7dgv96b8s8ivf84hqo9pt` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `documents`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `documents` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `category` varchar(120) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `description` varchar(1024) DEFAULT NULL,
  `owner` varchar(160) DEFAULT NULL,
  `status` enum('DRAFT','ACTIVE','REJECTED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `title` varchar(255) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `folder_id` bigint DEFAULT NULL,
  `approval_decided_at` datetime(6) DEFAULT NULL,
  `approval_requested_at` datetime(6) DEFAULT NULL,
  `approver_id` bigint DEFAULT NULL,
  `supervisor_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKrf3bw1phgxnisimja0q0ooejl` (`title`,`owner`),
  KEY `FKl4i1c29c2q5xnsk0u4n1lgyfx` (`folder_id`),
  KEY `FK2ebqwlioplha1buys7f99vev4` (`approver_id`),
  CONSTRAINT `FK2ebqwlioplha1buys7f99vev4` FOREIGN KEY (`approver_id`) REFERENCES `app_users` (`id`),
  CONSTRAINT `FKl4i1c29c2q5xnsk0u4n1lgyfx` FOREIGN KEY (`folder_id`) REFERENCES `document_folders` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `folder_group_permissions`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `folder_group_permissions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `can_delete` bit(1) NOT NULL,
  `can_read` bit(1) NOT NULL,
  `can_write` bit(1) NOT NULL,
  `folder_id` bigint NOT NULL,
  `group_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK1mslunfs1t7bihianl2v3i0dq` (`folder_id`,`group_id`),
  KEY `FK3rbdp0udfre4kaf4lgegl9v62` (`group_id`),
  CONSTRAINT `FK3rbdp0udfre4kaf4lgegl9v62` FOREIGN KEY (`group_id`) REFERENCES `user_groups` (`id`),
  CONSTRAINT `FKtnvnaotpttlp082xhc3nohg8n` FOREIGN KEY (`folder_id`) REFERENCES `document_folders` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=41 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `folder_metadata_fields`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `folder_metadata_fields` (
  `folder_id` bigint NOT NULL,
  `field_hint` varchar(255) DEFAULT NULL,
  `field_key` varchar(64) NOT NULL,
  `field_label` varchar(160) NOT NULL,
  `is_required` bit(1) DEFAULT NULL,
  `field_type` enum('DATE','NUMBER','TEXT') NOT NULL,
  `field_order` int NOT NULL,
  `code_table_code` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`folder_id`,`field_order`),
  CONSTRAINT `FKih8j4rd8f95huuoxigtktfs6e` FOREIGN KEY (`folder_id`) REFERENCES `document_folders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `knowledge_contributions`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledge_contributions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `content` varchar(4000) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `linked_document_id` bigint DEFAULT NULL,
  `linked_document_title` varchar(255) DEFAULT NULL,
  `author_id` bigint NOT NULL,
  `topic_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKhbx8vle9qvso1y4wr4rsnvh63` (`author_id`),
  KEY `FK33v9t58huj7lrb0fqyq3y3v6u` (`topic_id`),
  CONSTRAINT `FK33v9t58huj7lrb0fqyq3y3v6u` FOREIGN KEY (`topic_id`) REFERENCES `knowledge_topics` (`id`),
  CONSTRAINT `FKhbx8vle9qvso1y4wr4rsnvh63` FOREIGN KEY (`author_id`) REFERENCES `app_users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `knowledge_topic_document_links`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledge_topic_document_links` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `document_id` bigint NOT NULL,
  `document_title` varchar(255) DEFAULT NULL,
  `linked_at` datetime(6) NOT NULL,
  `note` varchar(512) DEFAULT NULL,
  `linked_by_id` bigint NOT NULL,
  `topic_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKlmbgikswklt2vm70iv83y4u76` (`linked_by_id`),
  KEY `FKlip57wg3b067cknhun3euo2xb` (`topic_id`),
  CONSTRAINT `FKlip57wg3b067cknhun3euo2xb` FOREIGN KEY (`topic_id`) REFERENCES `knowledge_topics` (`id`),
  CONSTRAINT `FKlmbgikswklt2vm70iv83y4u76` FOREIGN KEY (`linked_by_id`) REFERENCES `app_users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `knowledge_topic_members`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledge_topic_members` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `joined_at` datetime(6) NOT NULL,
  `topic_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK20kqt8q0v98yovhvyr94hgxys` (`topic_id`,`user_id`),
  KEY `FKnh0dxiajl40y8q81pi0vc6anu` (`user_id`),
  CONSTRAINT `FKlwdhv9pmitnlv2vn5id1ka50r` FOREIGN KEY (`topic_id`) REFERENCES `knowledge_topics` (`id`),
  CONSTRAINT `FKnh0dxiajl40y8q81pi0vc6anu` FOREIGN KEY (`user_id`) REFERENCES `app_users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `knowledge_topic_shares`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledge_topic_shares` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `message` varchar(512) DEFAULT NULL,
  `shared_at` datetime(6) NOT NULL,
  `recipient_id` bigint NOT NULL,
  `sender_id` bigint NOT NULL,
  `topic_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKj154hdfimdsy7dmrn10r6hxde` (`recipient_id`),
  KEY `FK9k3gsecvhine79tj2tcsul6fw` (`sender_id`),
  KEY `FKdb4916w11s5p7h75tos9jdslw` (`topic_id`),
  CONSTRAINT `FK9k3gsecvhine79tj2tcsul6fw` FOREIGN KEY (`sender_id`) REFERENCES `app_users` (`id`),
  CONSTRAINT `FKdb4916w11s5p7h75tos9jdslw` FOREIGN KEY (`topic_id`) REFERENCES `knowledge_topics` (`id`),
  CONSTRAINT `FKj154hdfimdsy7dmrn10r6hxde` FOREIGN KEY (`recipient_id`) REFERENCES `app_users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `knowledge_topic_stars`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledge_topic_stars` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `starred_at` datetime(6) NOT NULL,
  `topic_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKp0xfmfe6iqisih6rxptar3qfi` (`topic_id`,`user_id`),
  KEY `FKl5tjckp1q37ap8h9bgm0anevo` (`user_id`),
  CONSTRAINT `FK9o4ha6kc5of5rii86m3cln089` FOREIGN KEY (`topic_id`) REFERENCES `knowledge_topics` (`id`),
  CONSTRAINT `FKl5tjckp1q37ap8h9bgm0anevo` FOREIGN KEY (`user_id`) REFERENCES `app_users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `knowledge_topic_tags`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledge_topic_tags` (
  `topic_id` bigint NOT NULL,
  `tag` varchar(64) DEFAULT NULL,
  KEY `FKlquq0qk8j48h2hshyigqjvv2m` (`topic_id`),
  CONSTRAINT `FKlquq0qk8j48h2hshyigqjvv2m` FOREIGN KEY (`topic_id`) REFERENCES `knowledge_topics` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `knowledge_topic_uploads`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledge_topic_uploads` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `content` longblob,
  `content_type` varchar(160) DEFAULT NULL,
  `description` varchar(512) DEFAULT NULL,
  `file_name` varchar(255) NOT NULL,
  `size` bigint NOT NULL,
  `uploaded_at` datetime(6) NOT NULL,
  `topic_id` bigint NOT NULL,
  `uploaded_by_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FK7jmeq0s2x8pjrfmsagsybnk1d` (`topic_id`),
  KEY `FKt0s3cs0ie7et2axd9gm7py2ls` (`uploaded_by_id`),
  CONSTRAINT `FK7jmeq0s2x8pjrfmsagsybnk1d` FOREIGN KEY (`topic_id`) REFERENCES `knowledge_topics` (`id`),
  CONSTRAINT `FKt0s3cs0ie7et2axd9gm7py2ls` FOREIGN KEY (`uploaded_by_id`) REFERENCES `app_users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `knowledge_topics`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledge_topics` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `description` varchar(4000) DEFAULT NULL,
  `title` varchar(220) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `created_by_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FKhs2f40pqjbux2vexaer9pv9wo` (`created_by_id`),
  CONSTRAINT `FKhs2f40pqjbux2vexaer9pv9wo` FOREIGN KEY (`created_by_id`) REFERENCES `app_users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `system_code_table_items`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_code_table_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `table_code` varchar(64) NOT NULL,
  `item_code` varchar(64) NOT NULL,
  `item_label` varchar(160) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_code_table_item` (`table_code`,`item_code`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `system_job_schedules`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_job_schedules` (
  `job_key` varchar(64) NOT NULL,
  `cron_expression` varchar(64) NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_run_at` timestamp NULL DEFAULT NULL,
  `last_status` varchar(32) DEFAULT NULL,
  `last_message` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`job_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_group_members`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_group_members` (
  `user_id` bigint NOT NULL,
  `group_id` bigint NOT NULL,
  PRIMARY KEY (`user_id`,`group_id`),
  KEY `FKtojippg1wvsa2cybvlq4gbi4l` (`group_id`),
  CONSTRAINT `FKky3ptgysfnsxwumeyfg77mfvn` FOREIGN KEY (`user_id`) REFERENCES `app_users` (`id`),
  CONSTRAINT `FKtojippg1wvsa2cybvlq4gbi4l` FOREIGN KEY (`group_id`) REFERENCES `user_groups` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_groups`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_groups` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `description` varchar(512) DEFAULT NULL,
  `name` varchar(120) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKeg8568m4xp44f9n0gi07l9afa` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_tasks`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_tasks` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `description` varchar(2000) DEFAULT NULL,
  `document_id` bigint DEFAULT NULL,
  `document_title` varchar(255) DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `priority` enum('CRITICAL','HIGH','LOW','NORMAL') NOT NULL,
  `status` enum('BLOCKED','CANCELLED','COMPLETED','IN_PROGRESS','PENDING') NOT NULL,
  `task_type` varchar(32) NOT NULL,
  `title` varchar(180) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `workflow_step` varchar(160) DEFAULT NULL,
  `assignee_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKoqshmrkmwybskgrs8n8bi114n` (`assignee_id`),
  CONSTRAINT `FKoqshmrkmwybskgrs8n8bi114n` FOREIGN KEY (`assignee_id`) REFERENCES `app_users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=30 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping routines for database 'dms'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-04-08  9:58:49
