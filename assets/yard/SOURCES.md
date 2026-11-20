# Материалы двора

## Жданова, 14, Уральск

Адресная карточка и метка дома находятся в [Яндекс Картах](https://yandex.kz/maps/ru/10305/uralsk/house/zhdanov_koshesi_14/YUgYcgRoTEQFQFtrfX5zeHtiZQ==/). Координата начала сцены задана пользователем у стены. Контуры опубликованной карты опираются на [OpenStreetMap](https://www.openstreetmap.org/#map=19/51.23019/51.43926), © OpenStreetMap contributors, ODbL.

На снимках западной стороны видны светлый кирпич, мятные панели лоджий, белые переплёты, металлические решётки и наружные лестницы. Фасады двух встроенных помещений воспроизведены по [фотографии аптеки](https://yandex.kz/maps/ru/org/apteka/143279169595/gallery/) и [фотографии нотариуса](https://yandex.kz/maps/ru/org/notar_s/125053931820/gallery/). Положения входов соотнесены с двумя ближайшими лоджиями по меткам организаций. Размеры и износ отдельных деталей приблизительны. Геометрия и изображения вывесок в модели созданы специально для сцены.

## Голограмма Уральска

Ближний район сохраняет контуры отдельных домов и улиц. Дальний план собран в пределах [городской границы Уральска](https://www.openstreetmap.org/relation/3388710). Внутри неё 51 624 спутниковых контура из [Microsoft Global ML Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints) сгруппированы в ячейки по 320 м. Высоты объёмов передают плотность застройки. Магистрали и водотоки взяты из [OpenFreeMap](https://openfreemap.org/) и [© OpenMapTiles](https://openmaptiles.org/) на основе [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Производные данные и описание преобразования опубликованы в `yard/data/oral-relief.js` и `yard/data/city-district.js`.

## Сканированные поверхности

Фотоматериалы для фактуры взяты из библиотеки Poly Haven по [лицензии CC0](https://polyhaven.com/license). Цвет откорректирован под референсы двора. Красный канал карты поверхности содержит высоту, зелёный — шероховатость. Кирпичная перевязка и швы синтезированы с шагом 0,26 × 0,075 м. Зерно кирпича получено из скана бетона.

| Применение | Источник |
| --- | --- |
| Асфальт, битум | [Asphalt 04](https://polyhaven.com/a/asphalt_04) |
| Бетон, минеральное зерно | [Concrete Floor 02](https://polyhaven.com/a/concrete_floor_02) |
| Сухая почва | [Brown Mud Dry](https://polyhaven.com/a/brown_mud_dry) |
| Штукатурка и крашеные минеральные основания | [Plastered Wall 02](https://polyhaven.com/a/plastered_wall_02) |
| Древесная кора | [Bark Brown 02](https://polyhaven.com/a/bark_brown_02) |
| Износ окрашенного металла | [Rusty Painted Metal](https://polyhaven.com/a/rusty_painted_metal) |

Небольшие WebP-карты в `yard/assets/surfaces/` воспроизводятся командой `python tools/bake-yard-materials.py`. Отражения в окнах и лужах сняты в самой модели двора. Трава, ветви, листья и стеклопакеты моделируются локально.
