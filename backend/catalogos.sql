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
-- Dumping data for table `productos`
--
-- WHERE:  1=1

LOCK TABLES `productos` WRITE;
/*!40000 ALTER TABLE `productos` DISABLE KEYS */;
INSERT INTO `productos` (`id_producto`, `nombre`, `unidad`, `tipo_producto`, `activo`) VALUES (1,'Maiz Blanco','quintal','granos',1),(2,'Maiz Amarillo','quintal','granos',1),(3,'Frijol Rojo','quintal','granos',1),(4,'Arroz Blanco','quintal','granos',1),(5,'Tomate','caja','hortalizas',1),(6,'Chile Verde','caja','hortalizas',1),(7,'Loroco','jaba','hortalizas',1),(8,'Platano','caja','frutales',1),(9,'Naranja','ciento','frutales',1),(10,'Cafe Oro','quintal','frutales',1),(11,'Cacao','quintal','frutales',1),(12,'Quesillo','libra','lacteos',1),(13,'Queso Duro','libra','lacteos',1),(14,'Leche','botella','lacteos',1);
/*!40000 ALTER TABLE `productos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `categorias_costos`
--
-- WHERE:  1=1

LOCK TABLES `categorias_costos` WRITE;
/*!40000 ALTER TABLE `categorias_costos` DISABLE KEYS */;
INSERT INTO `categorias_costos` (`id_categoria`, `nombre`, `tipo_producto`, `es_fijo_default`) VALUES (1,'Agua','granos',0),(2,'Abono','granos',0),(3,'Semillas','granos',0),(4,'Herbicida','granos',0),(5,'Insecticida','granos',0),(6,'Maquinaria','granos',1),(7,'Mano de obra','granos',1),(8,'Agua','hortalizas',0),(9,'Abono','hortalizas',0),(10,'Semillas','hortalizas',0),(11,'Plaguicida','hortalizas',0),(12,'Insecticida','hortalizas',0),(13,'Maquinaria','hortalizas',1),(14,'Mano de obra','hortalizas',1),(15,'Agua','frutales',0),(16,'Abono','frutales',0),(17,'Poda','frutales',0),(18,'Plaguicida','frutales',0),(19,'Maquinaria','frutales',1),(20,'Mano de obra','frutales',1),(21,'Alimento del ganado','lacteos',0),(22,'Veterinario','lacteos',0),(23,'Energia','lacteos',1),(24,'Equipo','lacteos',0),(25,'Mano de obra','lacteos',1);
/*!40000 ALTER TABLE `categorias_costos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `canales_venta`
--
-- WHERE:  1=1

LOCK TABLES `canales_venta` WRITE;
/*!40000 ALTER TABLE `canales_venta` DISABLE KEYS */;
INSERT INTO `canales_venta` (`id_canal`, `nombre`) VALUES (3,'Exportacion / Bolsa'),(2,'Intermediario (Coyote)'),(1,'Mercado local'),(4,'Procesadora');
/*!40000 ALTER TABLE `canales_venta` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-29 20:54:43
