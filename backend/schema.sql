-- MySQL dump 10.13  Distrib 9.6.0, for Win64 (x86_64)
--
-- Host: localhost    Database: agronomodigital
-- ------------------------------------------------------
-- Server version	9.6.0

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
-- Table structure for table `canales_venta`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `canales_venta` (
  `id_canal` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(60) NOT NULL,
  PRIMARY KEY (`id_canal`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `categorias_costos`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `categorias_costos` (
  `id_categoria` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(60) NOT NULL,
  `tipo_producto` varchar(30) NOT NULL,
  `es_fijo_default` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id_categoria`),
  UNIQUE KEY `nombre` (`nombre`,`tipo_producto`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `historial_precios`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `historial_precios` (
  `id_precio` int NOT NULL AUTO_INCREMENT,
  `id_producto` int DEFAULT NULL,
  `id_canal` int DEFAULT NULL,
  `fecha` date NOT NULL,
  `precio_venta_quintal` decimal(10,2) NOT NULL,
  PRIMARY KEY (`id_precio`),
  KEY `fk_precio_producto` (`id_producto`),
  KEY `fk_precio_canal` (`id_canal`),
  CONSTRAINT `fk_precio_canal` FOREIGN KEY (`id_canal`) REFERENCES `canales_venta` (`id_canal`),
  CONSTRAINT `fk_precio_producto` FOREIGN KEY (`id_producto`) REFERENCES `productos` (`id_producto`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `parcelas`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `parcelas` (
  `id_parcela` int NOT NULL AUTO_INCREMENT,
  `id_usuario` int NOT NULL,
  `nombre_parcela` varchar(100) NOT NULL,
  `ubicacion` varchar(255) DEFAULT NULL,
  `tamano` decimal(10,2) DEFAULT NULL,
  `produccion_quintales` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`id_parcela`),
  KEY `fk_parcela_usuario` (`id_usuario`),
  CONSTRAINT `fk_parcela_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `produccion_parcelas`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `produccion_parcelas` (
  `id_produccion` int NOT NULL AUTO_INCREMENT,
  `id_parcela` int NOT NULL,
  `id_producto` int NOT NULL,
  `ciclo` varchar(30) NOT NULL DEFAULT 'actual',
  `produccion` decimal(10,2) NOT NULL,
  `fecha_registro` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_produccion`),
  UNIQUE KEY `uq_prod_parcela_ciclo` (`id_parcela`,`id_producto`,`ciclo`),
  KEY `idx_prod_parcela` (`id_parcela`),
  KEY `idx_prod_producto` (`id_producto`),
  CONSTRAINT `fk_prod_parcela` FOREIGN KEY (`id_parcela`) REFERENCES `parcelas` (`id_parcela`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_prod_producto` FOREIGN KEY (`id_producto`) REFERENCES `productos` (`id_producto`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `productos`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `productos` (
  `id_producto` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `unidad` varchar(20) NOT NULL,
  `tipo_producto` varchar(30) NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id_producto`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `publicaciones`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `publicaciones` (
  `id_publicacion` int NOT NULL AUTO_INCREMENT,
  `id_usuario` int NOT NULL,
  `id_parcela` int DEFAULT NULL,
  `id_producto` int NOT NULL,
  `id_canal` int NOT NULL,
  `cantidad` decimal(10,2) NOT NULL,
  `precio_unitario` decimal(10,2) NOT NULL,
  `estado` enum('disponible','vendido','retirado') NOT NULL DEFAULT 'disponible',
  `fecha` date NOT NULL,
  `creado_en` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_publicacion`),
  KEY `fk_pub_usuario` (`id_usuario`),
  KEY `fk_pub_parcela` (`id_parcela`),
  KEY `fk_pub_canal` (`id_canal`),
  KEY `idx_pub_producto` (`id_producto`,`estado`),
  CONSTRAINT `fk_pub_canal` FOREIGN KEY (`id_canal`) REFERENCES `canales_venta` (`id_canal`),
  CONSTRAINT `fk_pub_parcela` FOREIGN KEY (`id_parcela`) REFERENCES `parcelas` (`id_parcela`) ON DELETE SET NULL,
  CONSTRAINT `fk_pub_producto` FOREIGN KEY (`id_producto`) REFERENCES `productos` (`id_producto`),
  CONSTRAINT `fk_pub_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `transacciones_costos`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transacciones_costos` (
  `id_transaccion` int NOT NULL AUTO_INCREMENT,
  `id_parcela` int NOT NULL,
  `id_producto` int DEFAULT NULL,
  `tipo_costo` varchar(50) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `monto` decimal(10,2) NOT NULL,
  `fecha` date NOT NULL,
  `es_fijo` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id_transaccion`),
  KEY `fk_costo_producto` (`id_producto`),
  KEY `fk_costo_parcela` (`id_parcela`),
  CONSTRAINT `fk_costo_parcela` FOREIGN KEY (`id_parcela`) REFERENCES `parcelas` (`id_parcela`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_costo_producto` FOREIGN KEY (`id_producto`) REFERENCES `productos` (`id_producto`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `usuarios`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuarios` (
  `id_usuario` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `correo` varchar(150) NOT NULL,
  `contrasena` varchar(255) NOT NULL,
  PRIMARY KEY (`id_usuario`),
  UNIQUE KEY `correo` (`correo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-29 20:54:20
