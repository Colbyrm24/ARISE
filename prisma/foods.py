# -*- coding: utf-8 -*-
"""
ARISE food library.

Values are per the serving stated on each row, for the food as normally
eaten (cooked where cooking is normal). Sources are standard reference
composition for generic whole foods — nutrition facts are facts, so there's
no library being copied here, the same reasoning as the exercise list.

Rounding: calories to the nearest 5 under 200 and nearest 10 above; macros
to the nearest gram. Precision beyond that is false confidence — portion
size is the real error term, not the reference value.
"""

# name, serving, kcal, protein, carbs, fat, category
F = [
# ---------- POULTRY ----------
("Chicken breast, grilled",            "4 oz cooked", 185, 35, 0, 4, "Protein"),
("Chicken breast, grilled",            "6 oz cooked", 280, 53, 0, 6, "Protein"),
("Chicken thigh, boneless skinless",   "4 oz cooked", 230, 27, 0, 13, "Protein"),
("Chicken thigh, bone-in with skin",   "1 thigh",     280, 24, 0, 20, "Protein"),
("Chicken drumstick, roasted",         "1 drumstick", 130, 14, 0, 8, "Protein"),
("Chicken drumstick, fried breaded",   "1 drumstick", 195, 16, 6, 11, "Protein"),
("Chicken thigh, fried breaded",       "1 thigh",     280, 22, 9, 18, "Protein"),
("Chicken wings, baked",               "4 wings",     320, 30, 0, 22, "Protein"),
("Chicken tenderloin, grilled",        "3 oz cooked", 130, 26, 0, 3, "Protein"),
("Rotisserie chicken, white meat",     "4 oz",        190, 33, 0, 6, "Protein"),
("Ground chicken, 93/7",               "4 oz cooked", 190, 30, 0, 8, "Protein"),
("Ground turkey, 93/7",                "4 oz cooked", 195, 31, 0, 8, "Protein"),
("Ground turkey, 99/1",                "4 oz cooked", 140, 32, 0, 2, "Protein"),
("Turkey breast, deli sliced",         "3 oz",         90, 18, 2, 1, "Protein"),
("Turkey bacon",                       "2 slices",     70,  6, 1, 5, "Protein"),

# ---------- BEEF & PORK ----------
("Ground beef, 90/10",                 "4 oz cooked", 250, 30, 0, 14, "Protein"),
("Ground beef, 80/20",                 "4 oz cooked", 300, 28, 0, 20, "Protein"),
("Ground beef, 96/4",                  "4 oz cooked", 190, 31, 0, 7, "Protein"),
("Sirloin steak, grilled",             "6 oz cooked", 330, 46, 0, 15, "Protein"),
("Ribeye steak, grilled",              "6 oz cooked", 480, 42, 0, 34, "Protein"),
("Filet mignon, grilled",              "6 oz cooked", 350, 46, 0, 18, "Protein"),
("Flank steak, grilled",               "6 oz cooked", 320, 48, 0, 13, "Protein"),
("Beef pot roast, cooked",             "5 oz",        350, 40, 0, 20, "Protein"),
("Beef stew meat, cooked",             "4 oz",        250, 33, 0, 12, "Protein"),
("Pork chop, boneless grilled",        "4 oz cooked", 220, 34, 0, 9, "Protein"),
("Pork chop, thin flat-top cooked",    "4 oz cooked", 230, 26, 0, 13, "Protein"),
("Pork tenderloin, roasted",           "4 oz cooked", 165, 30, 0, 4, "Protein"),
("Pulled pork, no sauce",              "4 oz",        280, 29, 0, 18, "Protein"),
("Bacon",                              "3 slices",    140, 10, 0, 11, "Protein"),
("Ham, deli sliced",                   "3 oz",        105, 16, 2, 4, "Protein"),
("Italian sausage link",               "1 link",      230, 13, 2, 19, "Protein"),
("Hot dog, beef",                      "1 hot dog",   180,  7, 2, 16, "Protein"),

# ---------- FISH & SEAFOOD ----------
("Salmon, baked",                      "6 oz cooked", 350, 39, 0, 21, "Protein"),
("Salmon, baked",                      "4 oz cooked", 235, 26, 0, 14, "Protein"),
("Tilapia, baked",                     "6 oz cooked", 195, 41, 0, 3, "Protein"),
("Cod, baked",                         "6 oz cooked", 180, 39, 0, 2, "Protein"),
("Haddock, pan seared",                "7 oz cooked", 215, 38, 0, 6, "Protein"),
("Mahi mahi, grilled",                 "6 oz cooked", 190, 41, 0, 2, "Protein"),
("Tuna, canned in water",              "1 can (5 oz)",120, 27, 0, 1, "Protein"),
("Tuna steak, seared",                 "6 oz cooked", 250, 51, 0, 4, "Protein"),
("Shrimp, cooked",                     "6 oz",        170, 36, 1, 2, "Protein"),
("Shrimp, breaded fried",              "6 pieces",    230, 12, 18, 12, "Protein"),
("Sardines, canned in oil",            "1 can",       190, 23, 0, 11, "Protein"),
("Scallops, seared",                   "6 oz",        160, 30, 5, 2, "Protein"),

# ---------- EGGS & DAIRY ----------
("Egg, whole large",                   "1 egg",        70,  6, 1, 5, "Protein"),
("Eggs, whole large",                  "3 eggs",      215, 19, 2, 15, "Protein"),
("Eggs, whole large",                  "5 eggs",      360, 32, 3, 24, "Protein"),
("Egg whites",                         "1 cup",       125, 26, 2, 0, "Protein"),
("Egg white, single",                  "1 white",      17,  4, 0, 0, "Protein"),
("Greek yogurt, nonfat plain",         "1 cup",       130, 23, 9, 0, "Dairy"),
("Greek yogurt, 2% plain",             "1 cup",       160, 20, 9, 4, "Dairy"),
("Oikos Pro / high-protein yogurt cup","1 cup",       140, 20, 9, 3, "Dairy"),
("Greek yogurt, flavored cup",         "1 cup",       150, 15, 18, 2, "Dairy"),
("Cottage cheese, 2%",                 "1 cup",       190, 24, 9, 5, "Dairy"),
("Cottage cheese, 4%",                 "1 cup",       220, 25, 9, 10, "Dairy"),
("Milk, whole",                        "1 cup",       150,  8, 12, 8, "Dairy"),
("Milk, 2%",                           "1 cup",       120,  8, 12, 5, "Dairy"),
("Milk, skim",                         "1 cup",        85,  8, 12, 0, "Dairy"),
("Almond milk, unsweetened",           "1 cup",        30,  1, 1, 3, "Dairy"),
("Oat milk",                           "1 cup",       120,  3, 16, 5, "Dairy"),
("Cheddar cheese",                     "1 oz",        115,  7, 1, 9, "Dairy"),
("Mozzarella, part skim",              "1 oz",         85,  7, 1, 6, "Dairy"),
("Parmesan, grated",                   "2 tbsp",       45,  4, 0, 3, "Dairy"),
("String cheese",                      "1 stick",      80,  7, 1, 6, "Dairy"),
("Cream cheese",                       "2 tbsp",      100,  2, 2, 10, "Dairy"),
("Butter",                             "1 tbsp",      100,  0, 0, 11, "Fats"),
("Heavy cream",                        "2 tbsp",      100,  1, 1, 11, "Dairy"),
("Sour cream",                         "2 tbsp",       60,  1, 1, 5, "Dairy"),

# ---------- PROTEIN SUPPLEMENTS ----------
("Whey protein powder",                "1 scoop",     120, 24, 3, 1, "Protein"),
("Whey isolate powder",                "1 scoop",     110, 25, 1, 0, "Protein"),
("Casein protein powder",              "1 scoop",     120, 24, 3, 1, "Protein"),
("Plant protein powder",               "1 scoop",     130, 21, 5, 3, "Protein"),
("Protein bar, typical",               "1 bar",       210, 20, 22, 7, "Protein"),
("Protein shake, ready to drink",      "1 bottle",    160, 30, 5, 3, "Protein"),
("Protein cookie",                     "1 cookie",    280, 16, 32, 10, "Protein"),

# ---------- GRAINS & STARCHES ----------
("White rice, cooked",                 "1 cup",       205,  4, 45, 0, "Carbs"),
("White rice, cooked",                 "230 g",       300,  6, 66, 1, "Carbs"),
("Jasmine rice, cooked",               "1 cup",       205,  4, 45, 0, "Carbs"),
("Brown rice, cooked",                 "1 cup",       215,  5, 45, 2, "Carbs"),
("Yellow rice, cooked",                "1 cup",       240,  4, 47, 4, "Carbs"),
("Quinoa, cooked",                     "1 cup",       220,  8, 39, 4, "Carbs"),
("Oats, dry rolled",                   "1/2 cup",     150,  5, 27, 3, "Carbs"),
("Oatmeal, cooked with water",         "1 cup",       160,  6, 28, 3, "Carbs"),
("Pasta, cooked",                      "1 cup",       220,  8, 43, 1, "Carbs"),
("Whole wheat pasta, cooked",          "1 cup",       175,  8, 37, 1, "Carbs"),
("Bread, white",                       "1 slice",      80,  3, 15, 1, "Carbs"),
("Bread, whole wheat",                 "1 slice",      80,  4, 14, 1, "Carbs"),
("Sourdough bread",                    "1 slice",     100,  4, 20, 1, "Carbs"),
("Bagel, plain",                       "1 bagel",     280, 11, 55, 2, "Carbs"),
("English muffin",                     "1 muffin",    130,  5, 25, 1, "Carbs"),
("Tortilla, flour 8 inch",             "1 tortilla",  150,  4, 24, 4, "Carbs"),
("Tortilla, corn 6 inch",              "2 tortillas", 110,  3, 22, 1, "Carbs"),
("Potato, baked",                      "1 medium",    160,  4, 37, 0, "Carbs"),
("Potatoes, roasted",                  "140 g",       230,  3, 25, 14, "Carbs"),
("Baby potatoes, boiled",              "6 small",     180,  4, 40, 0, "Carbs"),
("Sweet potato, baked",                "1 medium",    115,  2, 27, 0, "Carbs"),
("French fries",                       "medium order",340,  4, 44, 16, "Carbs"),
("Home fries / oven wedges",           "150 g",       250,  4, 33, 11, "Carbs"),
("Mashed potatoes with butter",        "1 cup",       240,  4, 35, 9, "Carbs"),
("Cereal, o-shaped",                   "1 cup",       100,  3, 20, 2, "Carbs"),
("Granola",                            "1/2 cup",     230,  5, 34, 9, "Carbs"),
("Cream of wheat, cooked",             "1 cup",       130,  4, 27, 0, "Carbs"),
("Couscous, cooked",                   "1 cup",       175,  6, 36, 0, "Carbs"),
("Corn on the cob",                    "1 ear",        80,  3, 17, 1, "Carbs"),
("Corn, kernels",                      "1 cup",       130,  5, 29, 2, "Carbs"),
("Rice cake",                          "1 cake",       35,  1, 7, 0, "Carbs"),
("Pancakes",                           "3 pancakes",  350,  8, 55, 11, "Carbs"),
("Waffle, frozen toasted",             "2 waffles",   190,  4, 30, 6, "Carbs"),

# ---------- LEGUMES ----------
("Black beans, cooked",                "1 cup",       225, 15, 41, 1, "Carbs"),
("Pinto beans, cooked",                "1 cup",       245, 15, 45, 1, "Carbs"),
("Refried beans",                      "1 cup",       220, 13, 36, 3, "Carbs"),
("Chickpeas, cooked",                  "1 cup",       270, 15, 45, 4, "Carbs"),
("Lentils, cooked",                    "1 cup",       230, 18, 40, 1, "Carbs"),
("Kidney beans, cooked",               "1 cup",       220, 15, 40, 1, "Carbs"),
("Edamame, shelled",                   "1 cup",       190, 18, 14, 8, "Carbs"),
("Hummus",                             "2 tbsp",       70,  2, 6, 5, "Fats"),

# ---------- FATS & NUTS ----------
("Olive oil",                          "1 tbsp",      120,  0, 0, 14, "Fats"),
("Avocado oil",                        "1 tbsp",      120,  0, 0, 14, "Fats"),
("Coconut oil",                        "1 tbsp",      120,  0, 0, 14, "Fats"),
("Cooking spray",                      "1 second",      5,  0, 0, 1, "Fats"),
("Peanut butter",                      "2 tbsp",      190,  8, 7, 16, "Fats"),
("Almond butter",                      "2 tbsp",      195,  7, 6, 18, "Fats"),
("Almonds",                            "1 oz",        165,  6, 6, 14, "Fats"),
("Walnuts",                            "1 oz",        185,  4, 4, 18, "Fats"),
("Cashews",                            "1 oz",        155,  5, 9, 12, "Fats"),
("Peanuts",                            "1 oz",        160,  7, 5, 14, "Fats"),
("Pistachios",                         "1 oz",        160,  6, 8, 13, "Fats"),
("Avocado",                            "1/2 medium",  160,  2, 9, 15, "Fats"),
("Guacamole",                          "2 tbsp",       50,  1, 3, 5, "Fats"),
("Chia seeds",                         "1 tbsp",       60,  2, 5, 4, "Fats"),
("Ground flaxseed",                    "1 tbsp",       55,  2, 3, 4, "Fats"),
("Mayonnaise",                         "1 tbsp",       95,  0, 0, 10, "Fats"),
("Light mayonnaise",                   "1 tbsp",       35,  0, 1, 3, "Fats"),
("Ranch dressing",                     "2 tbsp",      130,  1, 2, 13, "Fats"),
("Caesar dressing",                    "2 tbsp",      160,  1, 1, 17, "Fats"),
("Balsamic vinaigrette",               "2 tbsp",       90,  0, 3, 8, "Fats"),

# ---------- VEGETABLES ----------
("Broccoli, cooked",                   "1 cup",        55,  4, 11, 1, "Veg"),
("Green beans, cooked",                "1 cup",        45,  2, 10, 0, "Veg"),
("Asparagus, cooked",                  "1 cup",        40,  4, 7, 0, "Veg"),
("Spinach, raw",                       "2 cups",       15,  2, 2, 0, "Veg"),
("Spinach, cooked",                    "1 cup",        40,  5, 7, 0, "Veg"),
("Mixed greens salad, plain",          "2 cups",       20,  2, 4, 0, "Veg"),
("Cabbage and carrot mix, cooked",     "8 oz",         80,  3, 18, 0, "Veg"),
("Carrots, raw",                       "1 cup",        50,  1, 12, 0, "Veg"),
("Bell pepper",                        "1 medium",     30,  1, 7, 0, "Veg"),
("Onion, cooked",                      "1/2 cup",      45,  1, 10, 0, "Veg"),
("Mushrooms, cooked",                  "1 cup",        45,  3, 8, 1, "Veg"),
("Zucchini, cooked",                   "1 cup",        30,  2, 6, 0, "Veg"),
("Brussels sprouts, roasted",          "1 cup",        95,  4, 12, 4, "Veg"),
("Cauliflower, cooked",                "1 cup",        30,  2, 5, 0, "Veg"),
("Cauliflower rice",                   "1 cup",        25,  2, 5, 0, "Veg"),
("Tomato",                             "1 medium",     25,  1, 5, 0, "Veg"),
("Cucumber",                           "1 cup",        15,  1, 4, 0, "Veg"),
("Sweet corn salsa",                   "1/4 cup",      40,  1, 9, 0, "Veg"),
("Pico de gallo",                      "1/4 cup",      15,  1, 3, 0, "Veg"),

# ---------- FRUIT ----------
("Banana",                             "1 medium",    105,  1, 27, 0, "Fruit"),
("Apple",                              "1 medium",     95,  0, 25, 0, "Fruit"),
("Orange",                             "1 medium",     65,  1, 16, 0, "Fruit"),
("Strawberries",                       "1 cup",        50,  1, 12, 0, "Fruit"),
("Blueberries",                        "1 cup",        85,  1, 21, 0, "Fruit"),
("Raspberries",                        "1 cup",        65,  1, 15, 1, "Fruit"),
("Grapes",                             "1 cup",       105,  1, 27, 0, "Fruit"),
("Pineapple",                          "1 cup",        80,  1, 22, 0, "Fruit"),
("Watermelon",                         "1 cup",        45,  1, 11, 0, "Fruit"),
("Mango",                              "1 cup",        100,  1, 25, 0, "Fruit"),
("Peach",                              "1 medium",     60,  1, 14, 0, "Fruit"),
("Pear",                               "1 medium",    100,  1, 27, 0, "Fruit"),
("Cantaloupe",                         "1 cup",        55,  1, 13, 0, "Fruit"),
("Dates, medjool",                     "2 dates",     135,  1, 36, 0, "Fruit"),
("Raisins",                            "1/4 cup",     110,  1, 29, 0, "Fruit"),
("Applesauce, unsweetened",            "1 cup",       100,  0, 27, 0, "Fruit"),

# ---------- PREPARED MEALS ----------
("Chicken burrito bowl, rice and beans","1 bowl",     700, 45, 78, 22, "Meals"),
("Steak burrito bowl, rice and beans", "1 bowl",      750, 45, 75, 28, "Meals"),
("Burrito, beef rice and beans",       "1 burrito",   700, 35, 75, 28, "Meals"),
("Chicken and rice bowl with veggies", "1 bowl",      550, 45, 60, 12, "Meals"),
("Grilled chicken salad, light dressing","1 salad",   420, 40, 18, 20, "Meals"),
("Turkey sandwich on wheat",           "1 sandwich",  380, 25, 45, 10, "Meals"),
("Grilled chicken sandwich",           "1 sandwich",  440, 38, 43, 12, "Meals"),
("Fried chicken sandwich",             "1 sandwich",  650, 32, 55, 33, "Meals"),
("Cheeseburger, quarter pound",        "1 burger",    530, 30, 40, 27, "Meals"),
("Hamburger, single patty",            "1 burger",    350, 20, 33, 15, "Meals"),
("Slider, beef",                       "1 slider",    230, 12, 20, 12, "Meals"),
("Pizza, cheese",                      "1 slice",     285, 12, 36, 10, "Meals"),
("Pizza, pepperoni",                   "1 slice",     315, 13, 36, 13, "Meals"),
("Sushi roll, salmon avocado",         "8 pieces",    350, 15, 50, 10, "Meals"),
("Chicken stir fry with rice",         "1 plate",     600, 40, 70, 16, "Meals"),
("Spaghetti with meat sauce",          "1 plate",     600, 30, 75, 20, "Meals"),
("Chicken quesadilla",                 "1 whole",     650, 38, 45, 34, "Meals"),
("Beef tacos",                         "3 tacos",     540, 27, 45, 27, "Meals"),
("Chicken noodle soup",                "1 cup",       110,  7, 15, 3, "Meals"),
("Chili with beef and beans",          "1 cup",       290, 22, 25, 12, "Meals"),
("Protein oatmeal bowl",               "1 bowl",      420, 30, 50, 10, "Meals"),
("Egg and cheese breakfast sandwich",  "1 sandwich",  400, 20, 33, 21, "Meals"),
("Breakfast burrito, egg and sausage", "1 burrito",   580, 26, 45, 32, "Meals"),
("Caesar salad with chicken",          "1 salad",     560, 40, 20, 35, "Meals"),
("Poke bowl, tuna and rice",           "1 bowl",      620, 38, 75, 18, "Meals"),

# ---------- SNACKS & SWEETS ----------
("Beef jerky",                         "1 oz",         80, 12, 5, 1, "Snacks"),
("Pork rinds",                         "1 oz",        155, 17, 0, 9, "Snacks"),
("Popcorn, air popped",                "3 cups",       95,  3, 19, 1, "Snacks"),
("Potato chips",                       "1 oz",        155,  2, 15, 10, "Snacks"),
("Tortilla chips",                     "1 oz",        140,  2, 19, 7, "Snacks"),
("Pretzels",                           "1 oz",        110,  3, 23, 1, "Snacks"),
("Crackers, saltine",                  "5 crackers",   60,  1, 11, 1, "Snacks"),
("Granola bar",                        "1 bar",       140,  3, 24, 4, "Snacks"),
("Trail mix",                          "1/4 cup",     175,  5, 16, 11, "Snacks"),
("Dark chocolate",                     "1 oz",        170,  2, 13, 12, "Snacks"),
("Milk chocolate bar",                 "1 bar",       215,  3, 24, 13, "Snacks"),
("Ice cream, vanilla",                 "1/2 cup",     140,  2, 16, 7, "Snacks"),
("Halo-style light ice cream",         "1/2 cup",     100,  5, 16, 3, "Snacks"),
("Cookie, chocolate chip",             "1 cookie",    160,  2, 21, 8, "Snacks"),
("Brownie",                            "1 square",    240,  3, 36, 10, "Snacks"),
("Donut, glazed",                      "1 donut",     260,  4, 31, 14, "Snacks"),
("Muffin, blueberry",                  "1 muffin",    420,  6, 60, 18, "Snacks"),
("Cinnamon roll",                      "1 roll",      340,  5, 51, 13, "Snacks"),
("Rice krispie treat",                 "1 bar",        90,  1, 18, 2, "Snacks"),
("Fruit snacks",                       "1 pouch",      80,  0, 19, 0, "Snacks"),

# ---------- DRINKS ----------
("Coffee, black",                      "1 cup",         5,  0, 0, 0, "Drinks"),
("Coffee with cream and sugar",        "1 cup",        80,  1, 10, 4, "Drinks"),
("Latte, whole milk",                  "16 oz",       220, 12, 18, 11, "Drinks"),
("Latte, skim milk",                   "16 oz",       130, 13, 19, 0, "Drinks"),
("Espresso",                           "1 shot",        5,  0, 0, 0, "Drinks"),
("Orange juice",                       "1 cup",       110,  2, 26, 0, "Drinks"),
("Apple juice",                        "1 cup",       115,  0, 28, 0, "Drinks"),
("Soda, regular",                      "12 oz",       140,  0, 39, 0, "Drinks"),
("Diet soda",                          "12 oz",         0,  0, 0, 0, "Drinks"),
("Energy drink, sugar free",           "12 oz",        10,  0, 2, 0, "Drinks"),
("Sports drink",                       "20 oz",       130,  0, 34, 0, "Drinks"),
("Beer, regular",                      "12 oz",       155,  2, 13, 0, "Alcohol"),
("Light beer",                         "12 oz",       105,  1, 6, 0, "Alcohol"),
("Wine, red",                          "5 oz",        125,  0, 4, 0, "Alcohol"),
("Wine, white",                        "5 oz",        120,  0, 4, 0, "Alcohol"),
("Seltzer, hard",                      "1 can",       100,  0, 2, 0, "Alcohol"),
("Liquor, 80 proof",                   "1.5 oz",       95,  0, 0, 0, "Alcohol"),
("Kombucha",                           "12 oz",        60,  0, 14, 0, "Drinks"),
("Smoothie, fruit and protein",        "16 oz",       390, 30, 55, 6, "Drinks"),

# ---------- CONDIMENTS ----------
("Ketchup",                            "1 tbsp",       20,  0, 5, 0, "Condiments"),
("Mustard",                            "1 tbsp",        5,  0, 1, 0, "Condiments"),
("BBQ sauce",                          "2 tbsp",       60,  0, 15, 0, "Condiments"),
("Hot sauce",                          "1 tsp",         0,  0, 0, 0, "Condiments"),
("Soy sauce",                          "1 tbsp",       10,  1, 1, 0, "Condiments"),
("Honey",                              "1 tbsp",       65,  0, 17, 0, "Condiments"),
("Maple syrup",                        "2 tbsp",      105,  0, 27, 0, "Condiments"),
("Sugar, granulated",                  "1 tsp",        15,  0, 4, 0, "Condiments"),
("Salsa",                              "2 tbsp",       10,  0, 2, 0, "Condiments"),
("Marinara sauce",                     "1/2 cup",      70,  2, 12, 2, "Condiments"),
("Buffalo sauce",                      "1 tbsp",       10,  0, 1, 1, "Condiments"),
("Sugar-free syrup",                   "2 tbsp",       15,  0, 4, 0, "Condiments"),
]

def esc(s):
    return s.replace("'", "''")

rows = []
seen = set()
for name, serving, kcal, p, c, f, cat in F:
    key = (name.lower(), serving.lower())
    if key in seen:
        raise SystemExit(f"duplicate: {name} / {serving}")
    seen.add(key)
    # Sanity check: protein/carbs/fat should roughly reconcile with the stated
    # calories at 4/4/9. Alcohol is exempt — ethanol carries 7 kcal/g and has
    # no macro column, so those rows genuinely cannot reconcile. Everything
    # else has to, which is what catches a typo'd figure.
    calc = p * 4 + c * 4 + f * 9
    if cat != "Alcohol" and kcal > 20 and abs(calc - kcal) > max(45, kcal * 0.28):
        raise SystemExit(f"macro mismatch: {name} ({serving}) stated {kcal} vs {calc}")
    rows.append(
        f"  (gen_random_uuid(), '{esc(name)}', 'library', {kcal}, {p}, {c}, {f}, "
        f"'{esc(serving)}', '{esc(cat)}')"
    )

sql = (
    "-- ARISE food library. Generated — see seed/foods.py for the source table\n"
    "-- and the 4/4/9 reconciliation check every non-alcohol row has to pass.\n"
    "-- Safe to re-run: the delete only clears library rows, never a client's\n"
    "-- own custom foods, and never anything a nutrition_log points at.\n"
    "\n"
    "alter table public.foods add column if not exists category text;\n"
    "\n"
    "delete from public.foods\n"
    " where source = 'library'\n"
    "   and id not in (select food_id from public.nutrition_logs where food_id is not null);\n"
    "\n"
    "insert into public.foods (id, name, source, calories, protein, carbs, fat, serving_size, category)\n"
    "values\n" + ",\n".join(rows) + ";\n"
)
open("prisma/foods-seed.sql", "w").write(sql)
print(f"{len(rows)} foods across {len(set(x[6] for x in F))} categories")
